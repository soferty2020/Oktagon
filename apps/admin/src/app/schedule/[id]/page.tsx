import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { deleteSlotAction, publishTemplateAction } from '../actions';
import { AddSlotForm, GenerateForm } from '../schedule-forms';

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
    hallName: string | null;
    trainerName: string | null;
  }[];
}

interface BranchView {
  id: string;
  name: string;
}

interface HallView {
  id: string;
  name: string;
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

  const [template, branches, trainers] = await Promise.all([
    apiFetch<ScheduleTemplateView>(`/schedule-templates/${id}`, { accessToken }),
    apiFetch<BranchView[]>('/branches', { accessToken }),
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

  // Залы собираются по филиалам: отдельного плоского справочника нет.
  const halls: HallView[] = [];
  if (branches.ok) {
    const perBranch = await Promise.all(
      branches.data.map((branch) =>
        apiFetch<HallView[]>(`/branches/${branch.id}/halls`, { accessToken }),
      ),
    );
    for (const result of perBranch) {
      if (result.ok) {
        halls.push(...result.data);
      }
    }
  }

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
          <Link href="/schedule" className="text-sm text-slate-500 hover:text-slate-900">
            ← Все расписания
          </Link>
        }
      />

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Слоты расписания</h2>

        <table className="mt-3 w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
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
                <td colSpan={5} className="py-4 text-sm text-slate-500">
                  Слотов нет: расписание пустое, публиковать нечего
                </td>
              </tr>
            ) : (
              sortedSlots.map((slot) => (
                <tr key={slot.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 font-medium text-slate-900">
                    {WEEKDAY_LABELS[slot.weekday] ?? slot.weekday}
                  </td>
                  <td className="py-2 text-slate-600">
                    {slot.startTime}–{slot.endTime}
                  </td>
                  <td className="py-2 text-slate-600">{slot.hallName ?? '—'}</td>
                  <td className="py-2 text-slate-600">{slot.trainerName ?? '—'}</td>
                  <td className="py-2 text-right">
                    {canEdit && !isPublished ? (
                      <form action={deleteSlotAction}>
                        <input type="hidden" name="templateId" value={data.id} />
                        <input type="hidden" name="slotId" value={slot.id} />
                        <button
                          type="submit"
                          className="text-xs text-slate-500 underline hover:text-red-700"
                        >
                          Удалить
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {canEdit && !isPublished ? (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <AddSlotForm templateId={data.id} halls={halls} trainers={trainerOptions} />
          </div>
        ) : null}

        {isPublished ? (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <Notice>
              Расписание опубликовано: слоты зафиксированы. Изменения вносятся в отдельные
              занятия, чтобы не переписать уже созданное расписание.
            </Notice>
          </div>
        ) : null}
      </section>

      {canEdit ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Занятия квартала</h2>
          <p className="mt-1 text-xs text-slate-500">
            Занятия создаются только на будущие даты. Повторный запуск дублей не создаст.
          </p>

          <div className="mt-4 flex flex-col gap-4">
            {!isPublished ? (
              <form action={publishTemplateAction}>
                <input type="hidden" name="templateId" value={data.id} />
                <button
                  type="submit"
                  disabled={sortedSlots.length === 0}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Опубликовать расписание
                </button>
              </form>
            ) : null}

            <GenerateForm templateId={data.id} />
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
