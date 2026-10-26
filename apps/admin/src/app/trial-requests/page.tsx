import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { secondaryButtonClass } from '@/components/ui';
import { apiFetch, describeError } from '@/lib/api/client';
import { describePermission } from '@/lib/permissions';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { StatusButton } from './forms';

export const metadata = {
  title: 'Заявки — OCTAGON',
};

interface TrialRequestView {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  childName: string | null;
  childAge: number | null;
  comment: string | null;
  status: string;
  source: string | null;
  createdAt: string;
  processedAt: string | null;
  processedBy: { id: string; email: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Новая',
  CONTACTED: 'Связались',
  TRIAL_SCHEDULED: 'Записан на пробное',
  CONVERTED: 'Стал спортсменом',
  REJECTED: 'Отказ',
};

const STATUS_CLASSES: Record<string, string> = {
  NEW: 'bg-amber-100 text-amber-800',
  CONTACTED: 'bg-blue-100 text-blue-800',
  TRIAL_SCHEDULED: 'bg-indigo-100 text-indigo-800',
  CONVERTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-neutral-100 text-neutral-600',
};

const FINAL = ['CONVERTED', 'REJECTED'];

/** Следующий шаг воронки: администратор не выбирает из списка, а двигает дальше. */
const NEXT_STEP: Record<string, { status: string; label: string } | null> = {
  NEW: { status: 'CONTACTED', label: 'Связались' },
  CONTACTED: { status: 'TRIAL_SCHEDULED', label: 'Записать на пробное' },
  TRIAL_SCHEDULED: { status: 'CONVERTED', label: 'Стал спортсменом' },
  CONVERTED: null,
  REJECTED: null,
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Заявки на пробную тренировку (ADR-0013, #25).
 *
 * Список с воронкой: администратор двигает заявку по шагам, а не выбирает статус
 * из выпадающего списка — так видно, что делать дальше.
 */
export default async function TrialRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;

  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  if (!user.permissions.includes('trial-requests.view')) {
    return (
      <AppShell user={user}>
        <PageHeader title="Заявки" />
        <Notice tone="info">{describePermission('trial-requests.view')}</Notice>
      </AppShell>
    );
  }

  const { accessToken } = await readTokens();
  const requestsResult = accessToken
    ? await apiFetch<TrialRequestView[]>('/api/v1/trial-requests', { accessToken })
    : null;

  const requests = requestsResult?.ok ? requestsResult.data : [];
  const filter = params.status && STATUS_LABELS[params.status] ? params.status : null;
  const visible = filter ? requests.filter((item) => item.status === filter) : requests;

  const counts = requests.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AppShell user={user}>
      <PageHeader
        title="Заявки"
        description="Пробные тренировки: от звонка до зачисления"
      />

      {!requestsResult?.ok && requestsResult ? (
        <Notice tone="info">{describeError(requestsResult.error)}</Notice>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          className={filter ? secondaryButtonClass : 'rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white'}
          href="/trial-requests"
        >
          Все ({requests.length})
        </Link>
        {Object.entries(STATUS_LABELS).map(([status, label]) => (
          <Link
            className={filter === status ? 'rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white' : secondaryButtonClass}
            href={`/trial-requests?status=${status}`}
            key={status}
          >
            {label} ({counts[status] ?? 0})
          </Link>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="Заявок нет"
          description="Когда кто-то оставит заявку на сайте, она появится здесь."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((request) => {
            const next = NEXT_STEP[request.status];

            return (
              <article className="rounded-xl border border-neutral-200 bg-white p-5" key={request.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {request.name}
                      {request.childName ? (
                        <span className="font-normal text-neutral-600">
                          {' '}
                          · ребёнок: {request.childName}
                          {request.childAge ? `, ${request.childAge} лет` : ''}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-neutral-600">
                      <a className="underline" href={`tel:${request.phone}`}>
                        {request.phone}
                      </a>
                      {request.email ? ` · ${request.email}` : ''}
                    </p>
                    {request.comment ? (
                      <p className="mt-1 text-sm text-neutral-700">{request.comment}</p>
                    ) : null}
                    <p className="mt-1 text-sm text-neutral-500">
                      {formatDate(request.createdAt)}
                      {request.source ? ` · источник: ${request.source}` : ''}
                      {request.processedBy ? ` · обработал: ${request.processedBy.email}` : ''}
                    </p>
                  </div>

                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      STATUS_CLASSES[request.status] ?? STATUS_CLASSES.NEW
                    }`}
                  >
                    {STATUS_LABELS[request.status] ?? request.status}
                  </span>
                </div>

                {!FINAL.includes(request.status) && user.permissions.includes('trial-requests.manage') ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
                    {next ? <StatusButton id={request.id} label={next.label} status={next.status} /> : null}
                    <StatusButton id={request.id} label="Отказ" status="REJECTED" />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
