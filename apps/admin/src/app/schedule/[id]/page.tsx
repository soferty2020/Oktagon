import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { deleteSlotAction, deleteTemplateAction, publishTemplateAction } from '../actions';
import { AddSlotForm, EditSlotForm, GenerateForm } from '../schedule-forms';

export const metadata = {
  title: 'Расписание группы — OCTAGON',
};

interface ScheduleTemplateView {
  id: string;
  groupId: string;
  groupName: string;
  year: number;
  quarter: number;
  validFrom: string;
  validTo: string;
  publishedAt: string | null;
  slots: {
    id: string;
    weekday: string;
    startTime: string;
    endTime: string;
    hallId: string | null;
    hallName: string | null;
    trainerId: string | null;
    trainerName: string | null;
  }[];
}

interface HallView {
  id: string;
  name: string;
  isActive: boolean;
}

interface TrainerView {
  id: string;
  displayName: string;
  isActive: boolean;
}

const WEEKDAY_LABELS: Record<string, string> = {
  MONDAY: 'Понедельник',
  TUESDAY: 'Вторник',
  WEDNESDAY: 'Среда',
  THURSDAY: 'Четверг',
  FRIDAY: 'Пятница',
  SATURDAY: 'Суббота',
  SUNDAY: 'Воскресенье',
};

const WEEKDAY_ORDER = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

/**
 * Карточка расписания группы.
 *
 * Пока шаблон не опубликован, слоты можно менять. После публикации они
 * зафиксированы: расписание уже показано, а занятия созданы, поэтому дальше
 * правятся отдельные занятия.
 */
export default async function ScheduleTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const { accessToken } = await readTokens();
  const canEdit = user.permissions.includes('schedule.edit');

  const [template, hallsResult, trainers] = await Promise.all([
    apiFetch<ScheduleTemplateView>(`/schedule-templates/${id}`, { accessToken }),
    apiFetch<HallView[]>('/halls', { accessToken }),
    apiFetch<TrainerView[]>('/trainers', { accessToken }),
  ]);

  if (!template.ok) {
    if (template.error.status === 404) {
      notFound();
    }
    return (
      <AppShell user={user}>
        <PageHeader title="Расписание" />
        <Notice tone="error">{describeError(template.error)}</Notice>
      </AppShell>
    );
  }

  // Плоский справочник залов: филиала больше нет, зал — самостоятельная единица.
  const halls: HallView[] = hallsResult.ok
    ? hallsResult.data.filter((hall) => hall.isActive)
    : [];

  const trainerOptions = (trainers.ok ? trainers.data : [])
    .filter((trainer) => trainer.isActive)
    .map((trainer) => ({ id: trainer.id, displayName: trainer.displayName }));

  const data = template.data;
  const isPublished = data.publishedAt !== null;
  const sortedSlots = [...data.slots].sort(
    (a, b) =>
      WEEKDAY_ORDER.indexOf(a.weekday) - WEEKDAY_ORDER.indexOf(b.weekday) ||
      a.startTime.localeCompare(b.startTime),
  );

  return (
    <AppShell user={user}>
      <PageHeader
        title={data.groupName}
        description={`${data.quarter} квартал ${data.year} · ${data.validFrom} — ${data.validTo} · ${
          isPublished ? `опубликовано ${data.publishedAt?.slice(0, 10)}` : 'черновик'
        }`}
        actions={
          <Link href="/schedule" className="text-sm text-muted hover:text-ink">
            ← Все расписания
          </Link>
        }
      />

      <section className="rounded-card border border-line bg-white p-5">
        <h2 className="text-sm font-semibold text-ink">Слоты расписания</h2>

        <table className="mt-3 w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-2">День</th>
              <th className="py-2">Время</th>
              <th className="py-2">Зал</th>
              <th className="py-2">Тренер</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {sortedSlots.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-sm text-muted">
                  Слотов нет: расписание пустое, публиковать нечего
                </td>
              </tr>
            ) : (
              sortedSlots.map((slot) => (
                <tr key={slot.id} className="border-b border-line last:border-0">
                  <td className="py-2 font-medium text-ink">
                    {WEEKDAY_LABELS[slot.weekday] ?? slot.weekday}
                  </td>
                  <td className="py-2 text-muted">
                    {slot.startTime}–{slot.endTime}
                  </td>
                  <td className="py-2 text-muted">{slot.hallName ?? '—'}</td>
                  <td className="py-2 text-muted">{slot.trainerName ?? '—'}</td>
                  <td className="py-2 text-right">
                    {canEdit ? (
                      <div className="flex flex-col items-end gap-2">
                        <details>
                          <summary className="cursor-pointer text-xs text-muted underline hover:text-ink">
                            Изменить
                          </summary>
                          <div className="mt-2 flex justify-end">
                            <EditSlotForm
                              halls={halls}
                              slot={slot}
                              templateId={data.id}
                              trainers={trainerOptions}
                            />
                          </div>
                        </details>
                        <form action={deleteSlotAction}>
                          <input type="hidden" name="templateId" value={data.id} />
                          <input type="hidden" name="slotId" value={slot.id} />
                          <button
                            type="submit"
                            className="text-xs text-muted underline hover:text-red-700"
                          >
                            Удалить
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {canEdit ? (
          <div className="mt-5 border-t border-line pt-4">
            <AddSlotForm templateId={data.id} halls={halls} trainers={trainerOptions} />
          </div>
        ) : null}

        {isPublished ? (
          <div className="mt-5 border-t border-line pt-4">
            <Notice>
              Расписание опубликовано. Слоты можно менять — уже созданные занятия при этом не
              перепишутся (BR-009). Чтобы применить новое время к занятиям, запустите
              «Создать занятия из расписания» с пересозданием.
            </Notice>
          </div>
        ) : null}
      </section>

      {canEdit ? (
        <section className="mt-6 rounded-card border border-line bg-white p-5">
          <h2 className="text-sm font-semibold text-ink">Занятия квартала</h2>
          <p className="mt-1 text-xs text-muted">
            Занятия создаются только на будущие даты. Повторный запуск дублей не создаст.
          </p>

          <div className="mt-4 flex flex-col gap-4">
            {!isPublished ? (
              <form action={publishTemplateAction}>
                <input type="hidden" name="templateId" value={data.id} />
                <button
                  type="submit"
                  disabled={sortedSlots.length === 0}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Опубликовать расписание
                </button>
              </form>
            ) : null}

            <GenerateForm templateId={data.id} />
          </div>
        </section>
      ) : null}

      {canEdit ? (
        <section className="mt-6 rounded-card border border-red-100 bg-red-50/50 p-5">
          <h2 className="text-sm font-semibold text-ink">Удалить расписание</h2>
          <p className="mt-1 text-xs text-muted">
            Будущие занятия из этого расписания снимутся, прошедшие останутся в истории.
            Группа и её спортсмены не удаляются.
          </p>
          <form action={deleteTemplateAction} className="mt-3">
            <input type="hidden" name="templateId" value={data.id} />
            <button
              type="submit"
              className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Удалить расписание
            </button>
          </form>
        </section>
      ) : null}
    </AppShell>
  );
}
