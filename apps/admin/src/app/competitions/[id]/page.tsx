import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { secondaryButtonClass } from '@/components/ui';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import {
  cancelCompetitionAction,
  completeCompetitionAction,
  planCompetitionAction,
  publishCompetitionAction,
  setCompetitionPaymentAction,
  startCompetitionAction,
} from '../actions';
import {
  AddCompetitionParticipantForm,
  AddEntryForm,
  CompetitionActionButton,
  EntryResultForm,
} from '../forms';

export const metadata = {
  title: 'Турнир — OCTAGON',
};

interface CompetitionDetails {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  organizer: string | null;
  level: string;
  description: string | null;
  status: string;
}

interface Entry {
  id: string;
  discipline: string;
  categorySnapshot: string;
  result: string;
  place: number | null;
  medal: string;
  comment: string | null;
}

interface Participant {
  id: string;
  athleteId: string;
  athlete: { id: string; firstName: string; lastName: string };
  paymentStatus: string;
  entries: Entry[];
}

interface Category {
  id: string;
  name: string;
  discipline: string;
}

interface AthleteView {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  PLANNED: 'Запланирован',
  IN_PROGRESS: 'Идёт',
  COMPLETED: 'Завершён',
  PUBLISHED: 'Опубликован',
  CANCELLED: 'Отменён',
};

const RESULT_LABELS: Record<string, string> = {
  PENDING: 'Нет итога',
  PLACED: 'Призовое место',
  PARTICIPATED: 'Участвовал',
  ELIMINATED: 'Выбыл',
  DISQUALIFIED: 'Дисквалифицирован',
  NO_SHOW: 'Не явился',
};

const MEDAL_LABELS: Record<string, string> = {
  NONE: '',
  GOLD: '🥇',
  SILVER: '🥈',
  BRONZE: '🥉',
};

/**
 * Карточка турнира (#40): заявки, участия и результаты.
 *
 * Оплата — на спортсмене, а не на участии: кумитэ и ката одного ребёнка не
 * удваивают платёж, и это видно в интерфейсе — кнопка одна на всю карточку.
 */
export default async function CompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { accessToken } = await readTokens();
  if (!accessToken) {
    redirect('/login');
  }

  const competitionResult = await apiFetch<CompetitionDetails>(`/api/v1/competitions/${id}`, {
    accessToken,
  });

  if (!competitionResult.ok) {
    return (
      <AppShell user={user}>
        <PageHeader title="Турнир" />
        <Notice tone="info">{describeError(competitionResult.error)}</Notice>
        <Link className={secondaryButtonClass} href="/competitions">
          Назад к списку
        </Link>
      </AppShell>
    );
  }

  const competition = competitionResult.data;
  const [participantsResult, categoriesResult, athletesResult] = await Promise.all([
    apiFetch<Participant[]>(`/api/v1/competitions/${id}/participants`, { accessToken }),
    apiFetch<Category[]>(`/api/v1/competitions/categories?competitionId=${id}`, { accessToken }),
    apiFetch<AthleteView[]>('/api/v1/athletes', { accessToken }),
  ]);

  const participants = participantsResult.ok ? participantsResult.data : [];
  const categories = categoriesResult.ok
    ? categoriesResult.data.filter((category) => category.id)
    : [];
  const athletes = (athletesResult.ok ? athletesResult.data : [])
    .filter((athlete) => athlete.status === 'ACTIVE')
    .map((athlete) => ({ id: athlete.id, label: `${athlete.lastName} ${athlete.firstName}` }));

  const canManage = user.permissions.includes('competitions.manage');
  const canResults = user.permissions.includes('competitions.results');
  const canPublish = user.permissions.includes('competitions.publish');
  const locked = ['PUBLISHED', 'CANCELLED'].includes(competition.status);

  return (
    <AppShell user={user}>
      <div className="mb-4">
        <Link className="text-sm text-neutral-600 hover:text-neutral-900" href="/competitions">
          ← Все турниры
        </Link>
      </div>

      <PageHeader
        title={competition.title}
        description={[
          new Date(competition.startsAt).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
          competition.location,
          competition.organizer,
        ]
          .filter(Boolean)
          .join(' · ')}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
          {STATUS_LABELS[competition.status] ?? competition.status}
        </span>

        {canManage && competition.status === 'DRAFT' ? (
          <CompetitionActionButton
            action={planCompetitionAction.bind(null, id)}
            label="Запланировать"
            pendingLabel="Планируем…"
          />
        ) : null}
        {canManage && competition.status === 'PLANNED' ? (
          <CompetitionActionButton
            action={startCompetitionAction.bind(null, id)}
            label="Начать"
            pendingLabel="Начинаем…"
          />
        ) : null}
        {canManage && competition.status === 'IN_PROGRESS' ? (
          <CompetitionActionButton
            action={completeCompetitionAction.bind(null, id)}
            label="Завершить"
            pendingLabel="Завершаем…"
          />
        ) : null}
        {canPublish && competition.status === 'COMPLETED' ? (
          <CompetitionActionButton
            action={publishCompetitionAction.bind(null, id)}
            label="Опубликовать результаты"
            pendingLabel="Публикуем…"
          />
        ) : null}
        {canManage && !locked ? (
          <CompetitionActionButton
            action={cancelCompetitionAction.bind(null, id)}
            label="Отменить"
            pendingLabel="Отменяем…"
            variant="secondary"
          />
        ) : null}
      </div>

      {competition.description ? (
        <p className="mb-6 whitespace-pre-line text-sm text-neutral-700">{competition.description}</p>
      ) : null}

      {categories.length === 0 ? (
        <Notice tone="info">
          Категорий нет. Соревнования без категорий не проводятся — их заводит руководитель клуба.
        </Notice>
      ) : null}

      {canResults && !locked ? (
        <section className="mb-8 rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">Заявить спортсмена</h2>
          <AddCompetitionParticipantForm athletes={athletes} competitionId={id} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Спортсмены <span className="text-neutral-500">({participants.length})</span>
        </h2>

        {participants.length === 0 ? (
          <EmptyState
            title="Заявок пока нет"
            description="Заявите спортсмена, отметьте оплату и добавьте участия в дисциплинах."
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
                      {participant.entries.length === 0
                        ? 'Нет участий'
                        : participant.entries
                            .map(
                              (entry) =>
                                `${entry.discipline === 'KATA' ? 'Ката' : 'Кумитэ'}: ${
                                  RESULT_LABELS[entry.result] ?? entry.result
                                }${entry.place ? `, ${entry.place} место` : ''} ${
                                  MEDAL_LABELS[entry.medal] ?? ''
                                }`,
                            )
                            .join(' · ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-neutral-600">
                      {participant.paymentStatus === 'PAID' ? 'Оплачено' : 'Не оплачено'}
                    </span>
                    {canResults && !locked ? (
                      <CompetitionActionButton
                        action={setCompetitionPaymentAction.bind(
                          null,
                          id,
                          participant.athlete.id,
                          participant.paymentStatus === 'PAID' ? 'UNPAID' : 'PAID',
                        )}
                        label={
                          participant.paymentStatus === 'PAID' ? 'Снять оплату' : 'Отметить оплату'
                        }
                        pendingLabel="…"
                        variant="secondary"
                      />
                    ) : null}
                  </div>
                </div>

                {canResults && !locked ? (
                  <div className="space-y-4 border-t border-neutral-100 pt-3">
                    <AddEntryForm
                      athleteId={participant.athlete.id}
                      categories={categories}
                      competitionId={id}
                    />

                    {participant.entries.map((entry) => (
                      <div className="rounded-lg bg-neutral-50 p-4" key={entry.id}>
                        <p className="mb-2 text-sm font-medium">
                          {entry.discipline === 'KATA' ? 'Ката' : 'Кумитэ'} ·{' '}
                          {entry.categorySnapshot}
                        </p>
                        <EntryResultForm
                          athleteId={participant.athlete.id}
                          competitionId={id}
                          current={{
                            result: entry.result,
                            place: entry.place,
                            medal: entry.medal,
                            comment: entry.comment,
                          }}
                          entryId={entry.id}
                          isKumite={entry.discipline === 'KUMITE'}
                        />
                      </div>
                    ))}
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
