import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { secondaryButtonClass } from '@/components/ui';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import {
  cancelEventAction,
  completeEventAction,
  planEventAction,
  publishEventAction,
  removeParticipantAction,
  setAdmissionAction,
  setPaymentAction,
  startEventAction,
} from '../actions';
import { AddParticipantForm, ResultForm, TransitionButton } from '../forms';

export const metadata = {
  title: 'Мероприятие — OCTAGON',
};

interface EventDetails {
  id: string;
  title: string;
  scheduledAt: string;
  location: string | null;
  organizer: string | null;
  description: string | null;
  status: string;
  participantsCount: number;
}

interface ParticipantView {
  id: string;
  athlete: { id: string; firstName: string; lastName: string };
  targetRank: string;
  targetRankLabel: string | null;
  snapshotRank: string | null;
  snapshotRankLabel: string | null;
  admission: string;
  paymentStatus: string;
  result: string;
  awardedRank: string | null;
  awardedRankLabel: string | null;
  resultComment: string | null;
}

interface AthleteView {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
}

const ADMISSION_LABELS: Record<string, string> = {
  PENDING: 'Не рассмотрен',
  ADMITTED: 'Допущен',
  REJECTED: 'Не допущен',
};

const RESULT_LABELS: Record<string, string> = {
  PENDING: 'Нет итога',
  PASSED: 'Сдал',
  FAILED: 'Не сдал',
  NO_SHOW: 'Не явился',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  PLANNED: 'Запланировано',
  IN_PROGRESS: 'Идёт',
  COMPLETED: 'Завершено',
  PUBLISHED: 'Опубликовано',
  CANCELLED: 'Отменено',
};

/**
 * Карточка мероприятия (#40): статус, участники, допуск, оплата и итог.
 *
 * Всё на одной странице: тренер ведёт экзамен в зале, и переходы между экранами
 * за участником или результатом мешали бы.
 */
export default async function AttestationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { accessToken } = await readTokens();
  if (!accessToken) {
    redirect('/login');
  }

  const eventResult = await apiFetch<EventDetails>(`/api/v1/certification-events/${id}`, {
    accessToken,
  });

  if (!eventResult.ok) {
    return (
      <AppShell user={user}>
        <PageHeader title="Мероприятие" />
        <Notice tone="info">{describeError(eventResult.error)}</Notice>
        <Link className={secondaryButtonClass} href="/attestations">
          Назад к списку
        </Link>
      </AppShell>
    );
  }

  const event = eventResult.data;
  const [participantsResult, athletesResult] = await Promise.all([
    apiFetch<ParticipantView[]>(`/api/v1/certification-events/${id}/participants`, { accessToken }),
    apiFetch<AthleteView[]>('/api/v1/athletes', { accessToken }),
  ]);

  const participants = participantsResult.ok ? participantsResult.data : [];
  const athletes = (athletesResult.ok ? athletesResult.data : [])
    .filter((athlete) => athlete.status === 'ACTIVE')
    .map((athlete) => ({
      id: athlete.id,
      label: `${athlete.lastName} ${athlete.firstName}`,
    }));

  const canManage = user.permissions.includes('attestations.manage');
  const canResults = user.permissions.includes('attestations.results');
  const canPublish = user.permissions.includes('attestations.publish');
  const canPayment = user.role === 'SUPERADMIN';

  return (
    <AppShell user={user}>
      <div className="mb-4">
        <Link className="text-sm text-neutral-600 hover:text-neutral-900" href="/attestations">
          ← Все мероприятия
        </Link>
      </div>

      <PageHeader
        title={event.title}
        description={[
          new Date(event.scheduledAt).toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
          event.location,
          event.organizer,
        ]
          .filter(Boolean)
          .join(' · ')}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
          {STATUS_LABELS[event.status] ?? event.status}
        </span>

        {canManage && event.status === 'DRAFT' ? (
          <TransitionButton action={planEventAction.bind(null, id)} label="Запланировать" pendingLabel="Планируем…" />
        ) : null}
        {canManage && event.status === 'PLANNED' ? (
          <TransitionButton action={startEventAction.bind(null, id)} label="Начать" pendingLabel="Начинаем…" />
        ) : null}
        {canManage && event.status === 'IN_PROGRESS' ? (
          <TransitionButton
            action={completeEventAction.bind(null, id)}
            label="Завершить"
            pendingLabel="Завершаем…"
          />
        ) : null}
        {canPublish && event.status === 'COMPLETED' ? (
          <TransitionButton
            action={publishEventAction.bind(null, id)}
            label="Опубликовать результаты"
            pendingLabel="Публикуем…"
          />
        ) : null}
        {canManage && !['PUBLISHED', 'CANCELLED'].includes(event.status) ? (
          <TransitionButton
            action={cancelEventAction.bind(null, id)}
            label="Отменить"
            pendingLabel="Отменяем…"
            variant="secondary"
          />
        ) : null}
      </div>

      {event.description ? (
        <p className="mb-6 whitespace-pre-line text-sm text-neutral-700">{event.description}</p>
      ) : null}

      {canResults ? (
        <section className="mb-8 rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">Добавить участника</h2>
          <AddParticipantForm athletes={athletes} eventId={id} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Участники <span className="text-neutral-500">({participants.length})</span>
        </h2>

        {participants.length === 0 ? (
          <EmptyState
            title="Участников пока нет"
            description="Добавьте спортсменов — им нужно указать целевую ступень."
          />
        ) : (
          <div className="space-y-4">
            {participants.map((participant) => (
              <article
                className="rounded-xl border border-neutral-200 bg-white p-5"
                key={participant.id}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link
                      className="font-medium hover:underline"
                      href={`/athletes/${participant.athlete.id}`}
                    >
                      {participant.athlete.lastName} {participant.athlete.firstName}
                    </Link>
                    <p className="text-sm text-neutral-600">
                      Цель: {participant.targetRankLabel ?? participant.targetRank}
                      {participant.snapshotRankLabel
                        ? ` · было: ${participant.snapshotRankLabel}`
                        : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-neutral-600">{ADMISSION_LABELS[participant.admission]}</span>
                    <span className="text-neutral-300">·</span>
                    <span className="text-neutral-600">
                      {participant.paymentStatus === 'PAID' ? 'Оплачено' : 'Не оплачено'}
                    </span>
                    <span className="text-neutral-300">·</span>
                    <span className="font-medium">
                      {participant.result === 'PASSED' && participant.awardedRankLabel
                        ? `Сдал: ${participant.awardedRankLabel}`
                        : (RESULT_LABELS[participant.result] ?? participant.result)}
                    </span>
                  </div>
                </div>

                {canResults && !['PUBLISHED', 'CANCELLED'].includes(event.status) ? (
                  <div className="space-y-3 border-t border-neutral-100 pt-3">
                    <div className="flex flex-wrap gap-2">
                      {(['ADMITTED', 'REJECTED', 'PENDING'] as const).map((admission) => (
                        <TransitionButton
                          action={setAdmissionAction.bind(
                            null,
                            id,
                            participant.athlete.id,
                            admission,
                          )}
                          key={admission}
                          label={
                            admission === 'PENDING'
                              ? 'Сбросить допуск'
                              : admission === 'ADMITTED'
                                ? 'Допустить'
                                : 'Не допускать'
                          }
                          pendingLabel="…"
                          variant="secondary"
                        />
                      ))}

                      {canPayment ? (
                        <TransitionButton
                          action={setPaymentAction.bind(
                            null,
                            id,
                            participant.athlete.id,
                            participant.paymentStatus === 'PAID' ? 'UNPAID' : 'PAID',
                          )}
                          label={participant.paymentStatus === 'PAID' ? 'Снять оплату' : 'Оплачено'}
                          pendingLabel="…"
                          variant="secondary"
                        />
                      ) : null}

                      <TransitionButton
                        action={removeParticipantAction.bind(null, id, participant.athlete.id)}
                        label="Удалить участника"
                        pendingLabel="…"
                        variant="secondary"
                      />
                    </div>

                    <ResultForm
                      athleteId={participant.athlete.id}
                      current={{
                        result: participant.result,
                        awardedRank: participant.awardedRank,
                        resultComment: participant.resultComment,
                      }}
                      eventId={id}
                    />
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
