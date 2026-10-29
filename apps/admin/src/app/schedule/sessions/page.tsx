import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { CancelSessionForm, CreateSessionForm, MoveSessionForm } from '../schedule-forms';

export const metadata = {
  title: 'Занятия — OCTAGON',
};

interface TrainingSessionView {
  id: string;
  groupId: string;
  groupName: string;
  hallName: string | null;
  trainerName: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  changeReason: string | null;
  cancelledAt: string | null;
  fromTemplate: boolean;
}

interface GroupView {
  id: string;
  name: string;
  hallName: string | null;
  isActive: boolean;
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

/**
 * Список занятий.
 *
 * Показывает, какие занятия созданы из расписания, а какие изменены точечно:
 * статус MOVED или CANCELLED означает, что квартальный шаблон не менялся
 * (BR-009).
 */
export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ groupId?: string; from?: string; to?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { groupId, from, to } = await searchParams;
  const { accessToken } = await readTokens();

  const query = new URLSearchParams();
  if (groupId) {
    query.set('groupId', groupId);
  }
  // По умолчанию показываем месяц назад и месяц вперёд: занятие, созданное
  // вчера и уже прошедшее, иначе пропадало из списка своей же группы (#74).
  query.set('from', from ?? daysFromToday(-30));
  query.set('to', to ?? daysFromToday(30));

  const sessions = await apiFetch<TrainingSessionView[]>(
    `/training-sessions${query.size > 0 ? `?${query.toString()}` : ''}`,
    { accessToken },
  );

  const canEdit = user.permissions.includes('schedule.edit');
  const canCancel = user.permissions.includes('schedule.cancel');

  // Данные для формы занятия вручную: активные группы, залы активных филиалов и
  // активные тренеры. Неактивные не предлагаются — занятие в закрытом зале или с
  // уволенным тренером создавать бессмысленно.
  let manualGroups: { id: string; name: string; hallName: string | null }[] = [];
  let manualHalls: { id: string; name: string }[] = [];
  let manualTrainers: { id: string; name: string }[] = [];

  if (canEdit) {
    const [groupsResult, hallsResult, trainersResult] = await Promise.all([
      apiFetch<GroupView[]>('/groups', { accessToken }),
      apiFetch<HallView[]>('/halls', { accessToken }),
      apiFetch<TrainerView[]>('/trainers?isActive=true', { accessToken }),
    ]);

    if (groupsResult.ok) {
      manualGroups = groupsResult.data
        .filter((group) => group.isActive)
        .map((group) => ({ id: group.id, name: group.name, hallName: group.hallName }));
    }

    if (trainersResult.ok) {
      manualTrainers = trainersResult.data
        .filter((trainer) => trainer.isActive)
        .map((trainer) => ({ id: trainer.id, name: trainer.displayName }));
    }

    if (hallsResult.ok) {
      manualHalls = hallsResult.data
        .filter((hall) => hall.isActive)
        .map((hall) => ({ id: hall.id, name: hall.name }));
    }
  }

  // Дата по умолчанию — сегодня по часовому поясу клуба: занятие чаще всего
  // заводят «за сегодня» или «за прошлый месяц».
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: process.env.CLUB_TIMEZONE ?? 'Asia/Almaty',
  }).format(new Date());

  return (
    <AppShell user={user}>
      <PageHeader
        title="Занятия"
        description="По умолчанию: месяц назад и месяц вперед. Время указано по часовому поясу клуба."
        actions={
          <Link href="/schedule" className="text-sm text-muted hover:text-ink">
            ← Расписания
          </Link>
        }
      />

      {sessions.ok && sessions.data.length === 0 ? (
        <Notice>
          Занятий за период нет. Если расписание опубликовано, создайте занятия на странице
          расписания группы. Прошедшее или разовое занятие можно добавить вручную.
        </Notice>
      ) : null}

      {!sessions.ok ? <Notice tone="error">{describeError(sessions.error)}</Notice> : null}

      {canEdit ? (
        // Форма свернута: она нужна редко (задним числом или разовое занятие), а
        // сверху отнимала место у самих занятий (#74).
        <details className="mb-6 rounded-card border border-line bg-white">
          <summary className="cursor-pointer list-none px-5 py-4">
            <span className="text-sm font-medium text-ink">Добавить занятие вручную</span>
            <span className="ml-2 text-xs text-muted">
              задним числом или разовое — шаблон не меняется
            </span>
          </summary>
          <div className="border-t border-line px-5 py-4">
            <CreateSessionForm
              groups={manualGroups}
              halls={manualHalls}
              trainers={manualTrainers}
              today={today}
            />
          </div>
        </details>
      ) : null}

      <div className="flex flex-col gap-3">
        {sessions.ok
          ? sessions.data.map((session) => (
              <article key={session.id} className="rounded-card border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{session.groupName}</p>
                    <p className="mt-1 text-sm text-muted">
                      {formatLocal(session.startsAt)} — {formatLocal(session.endsAt, true)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {session.hallName ?? 'зал не назначен'} ·{' '}
                      {session.trainerName ?? 'тренер не назначен'}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span className={statusClass(session.status)}>
                      {statusLabel(session.status)}
                    </span>
                    <span className="text-xs text-muted">
                      {session.fromTemplate ? 'из расписания' : 'добавлено вручную'}
                    </span>
                    <Link
                      href={`/schedule/sessions/${session.id}/attendance`}
                      className="text-xs text-muted underline hover:text-ink"
                    >
                      Посещаемость
                    </Link>
                  </div>
                </div>

                {session.changeReason ? (
                  <p className="mt-2 rounded-md bg-canvas px-3 py-2 text-xs text-muted">
                    Причина: {session.changeReason}
                  </p>
                ) : null}

                {session.status === 'CANCELLED' ? null : (
                  <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4 lg:flex-row">
                    {canEdit ? (
                      <div className="flex-1">
                        <p className="mb-2 text-xs font-medium text-muted">Перенести</p>
                        <MoveSessionForm sessionId={session.id} />
                      </div>
                    ) : null}
                    {canCancel ? (
                      <div className="flex-1">
                        <p className="mb-2 text-xs font-medium text-muted">Отменить</p>
                        <CancelSessionForm sessionId={session.id} />
                      </div>
                    ) : null}
                  </div>
                )}
              </article>
            ))
          : null}
      </div>
    </AppShell>
  );
}

function statusLabel(status: string): string {  switch (status) {
    case 'CANCELLED':
      return 'отменено';
    case 'MOVED':
      return 'перенесено';
    default:
      return 'по расписанию';
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'CANCELLED':
      return 'rounded-full bg-red-50 px-2 py-1 text-xs text-red-700';
    case 'MOVED':
      return 'rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700';
    default:
      return 'rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700';
  }
}

/** Дата со сдвигом от сегодняшней, `YYYY-MM-DD`. */
function daysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Момент UTC в локальном времени сервера.
 *
 * Отдельная функция, чтобы форматирование было в одном месте: значения приходят
 * в UTC, а показывать их нужно человеку.
 */
function formatLocal(iso: string, timeOnly = false): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  if (timeOnly) {
    return time;
  }
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${time}`;
}
