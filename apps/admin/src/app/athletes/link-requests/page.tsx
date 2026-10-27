import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { describePermission } from '@/lib/permissions';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { ApproveForm, RejectForm } from './link-request-forms';

export const metadata = {
  title: 'Заявки на привязку — OCTAGON',
};

interface LinkRequestView {
  id: string;
  status: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  phone: string | null;
  athleteId: string | null;
  rejectReason: string | null;
  createdAt: string;
}

interface Candidate {
  athleteId: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  groupName: string | null;
}

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function yearsBetween(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const years = Math.floor((Date.now() - new Date(value).getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${years} лет`;
}

/**
 * Заявки на привязку родителя (ADR-0015).
 *
 * Администратор видит, что родитель рассказал про ребёнка, и кандидатов из
 * карточек. Подтверждение — ручной выбор: однофамильцев много, а цена ошибки —
 * доступ к данным чужого ребёнка.
 */
export default async function LinkRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  if (!user.permissions.includes('users.manage')) {
    return (
      <AppShell user={user}>
        <PageHeader title="Заявки на привязку" />
        <Notice tone="info">{describePermission('users.manage')}</Notice>
      </AppShell>
    );
  }

  const { request: selectedId } = await searchParams;
  const { accessToken } = await readTokens();

  const requests = await apiFetch<LinkRequestView[]>('/link-requests', { accessToken });

  if (!requests.ok) {
    return (
      <AppShell user={user}>
        <PageHeader title="Заявки на привязку" />
        <Notice tone="error">{describeError(requests.error)}</Notice>
      </AppShell>
    );
  }

  const selected = requests.data.find((item) => item.id === selectedId) ?? null;
  const candidates = selected
    ? await apiFetch<Candidate[]>(`/link-requests/${selected.id}/candidates`, { accessToken })
    : null;

  return (
    <AppShell user={user}>
      <div className="mb-4">
        <Link className="text-sm text-muted hover:text-ink" href="/athletes">
          ← Спортсмены
        </Link>
      </div>

      <PageHeader
        title="Заявки на привязку"
        description="Родитель зарегистрировался и просит привязать ребёнка. До подтверждения он не видит данных."
      />

      {requests.data.length === 0 ? (
        <div className="rounded-card border border-line bg-white p-10 text-center">
          <p className="text-sm font-medium text-ink">Очередь пуста</p>
          <p className="mt-1 text-sm text-muted">
            Новые заявки появятся здесь. Родитель может привязаться и по коду — тогда заявка не нужна.
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <ul className="space-y-3">
            {requests.data.map((item) => (
              <li
                className={`rounded-card border bg-white p-5 ${
                  item.id === selectedId ? 'border-accent' : 'border-line'
                }`}
                key={item.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-ink">
                      {item.lastName} {item.firstName}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {formatDate(item.birthDate)}
                      {yearsBetween(item.birthDate) ? `, ${yearsBetween(item.birthDate)}` : ''}
                      {item.phone ? `, ${item.phone}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted">Заявка от {formatDate(item.createdAt)}</p>
                  </div>

                  <Link
                    className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink hover:bg-canvas"
                    href={`/athletes/link-requests?request=${item.id}`}
                  >
                    {item.id === selectedId ? 'Кандидаты ниже' : 'Найти карточку'}
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          <aside className="space-y-4">
            {!selected ? (
              <div className="rounded-card border border-dashed border-line bg-white p-6 text-sm text-muted">
                Выберите заявку слева, чтобы увидеть кандидатов и решить.
              </div>
            ) : (
              <>
                <section className="rounded-card border border-line bg-white p-5">
                  <h2 className="text-sm font-semibold text-ink">Кандидаты</h2>
                  <p className="mt-1 text-xs text-muted">
                    Карточки с похожей фамилией. Сверьте дату рождения.
                  </p>

                  {candidates?.ok && candidates.data.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {candidates.data.map((candidate) => (
                        <li className="rounded-lg border border-line p-3" key={candidate.athleteId}>
                          <p className="text-sm font-medium text-ink">
                            {candidate.lastName} {candidate.firstName}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {formatDate(candidate.birthDate)}
                            {candidate.groupName ? `, ${candidate.groupName}` : ''}
                          </p>
                          <div className="mt-2">
                            <ApproveForm athleteId={candidate.athleteId} requestId={selected.id} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-muted">
                      Похожих карточек нет. Заведите спортсмена и подтвердите заявку из его карточки.
                    </p>
                  )}
                </section>

                <section className="rounded-card border border-line bg-white p-5">
                  <h2 className="text-sm font-semibold text-ink">Отклонить</h2>
                  <p className="mt-1 text-xs text-muted">
                    Причина уйдёт родителю в приложение — сформулируйте понятно.
                  </p>
                  <RejectForm requestId={selected.id} />
                </section>
              </>
            )}
          </aside>
        </div>
      )}
    </AppShell>
  );
}
