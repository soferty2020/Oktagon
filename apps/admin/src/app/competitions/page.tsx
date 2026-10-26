import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { secondaryButtonClass } from '@/components/ui';
import { apiFetch, describeError } from '@/lib/api/client';
import { describePermission } from '@/lib/permissions';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { CreateCompetitionForm } from './forms';

export const metadata = {
  title: 'Соревнования — OCTAGON',
};

interface CompetitionView {
  id: string;
  title: string;
  startsAt: string;
  location: string | null;
  level: string;
  status: string;
  participantsCount: number;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  PLANNED: 'Запланирован',
  IN_PROGRESS: 'Идёт',
  COMPLETED: 'Завершён',
  PUBLISHED: 'Опубликован',
  CANCELLED: 'Отменён',
};

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: 'bg-neutral-100 text-neutral-700',
  PLANNED: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-green-100 text-green-800',
  PUBLISHED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const LEVEL_LABELS: Record<string, string> = {
  CLUB: 'Клубный',
  CITY: 'Городской',
  REGIONAL: 'Региональный',
  NATIONAL: 'Всероссийский',
  INTERNATIONAL: 'Международный',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Соревнования (#40): список и создание. */
export default async function CompetitionsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  if (!user.permissions.includes('competitions.view')) {
    return (
      <AppShell user={user}>
        <PageHeader title="Соревнования" />
        <Notice tone="info">{describePermission('competitions.view')}</Notice>
      </AppShell>
    );
  }

  const canManage = user.permissions.includes('competitions.manage');
  const { accessToken } = await readTokens();
  const competitions = accessToken
    ? await apiFetch<CompetitionView[]>('/api/v1/competitions', { accessToken })
    : null;

  const rows = competitions?.ok ? competitions.data : [];
  const active = rows.filter((item) => !['CANCELLED', 'PUBLISHED'].includes(item.status));
  const archive = rows.filter((item) => ['CANCELLED', 'PUBLISHED'].includes(item.status));

  return (
    <AppShell user={user}>
      <PageHeader title="Соревнования" description="Турниры, заявки и результаты" />

      <div className="mb-6">
        <Link className={secondaryButtonClass} href="/competitions/categories">
          Категории
        </Link>
      </div>

      {!competitions?.ok && competitions ? (
        <Notice tone="info">{describeError(competitions.error)}</Notice>
      ) : null}

      {canManage ? (
        <section className="mb-8 rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">Новый турнир</h2>
          <CreateCompetitionForm />
        </section>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="Турниров пока нет"
          description={
            canManage
              ? 'Создайте турнир — потом заявите спортсменов и внесите результаты.'
              : 'Когда появится турнир, он будет здесь.'
          }
        />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Активные
            </h2>
            {active.length === 0 ? (
              <p className="text-sm text-neutral-600">Нет активных турниров.</p>
            ) : (
              <CompetitionTable competitions={active} />
            )}
          </section>

          {archive.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Архив
              </h2>
              <CompetitionTable competitions={archive} />
            </section>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

function CompetitionTable({ competitions }: { competitions: CompetitionView[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-200 text-neutral-500">
          <tr>
            <th className="px-4 py-3 font-medium">Турнир</th>
            <th className="px-4 py-3 font-medium">Дата</th>
            <th className="px-4 py-3 font-medium">Уровень</th>
            <th className="px-4 py-3 font-medium">Заявлено</th>
            <th className="px-4 py-3 font-medium">Статус</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {competitions.map((competition) => (
            <tr className="border-b border-neutral-100 last:border-0" key={competition.id}>
              <td className="px-4 py-3 font-medium">{competition.title}</td>
              <td className="px-4 py-3 text-neutral-600">{formatDate(competition.startsAt)}</td>
              <td className="px-4 py-3 text-neutral-600">
                {LEVEL_LABELS[competition.level] ?? competition.level}
              </td>
              <td className="px-4 py-3 text-neutral-600">{competition.participantsCount}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                    STATUS_CLASSES[competition.status] ?? STATUS_CLASSES.DRAFT
                  }`}
                >
                  {STATUS_LABELS[competition.status] ?? competition.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <Link className={secondaryButtonClass} href={`/competitions/${competition.id}`}>
                  Открыть
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
