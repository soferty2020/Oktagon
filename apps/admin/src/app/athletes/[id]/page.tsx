import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { archiveAthleteAction, unlinkAccountAction } from '../actions';
import { EditAthleteForm, LinkAccountForm } from '../athlete-forms';

export const metadata = {
  title: 'Спортсмен — OCTAGON',
};

interface AthleteDetails {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  birthDate: string | null;
  gender: string;
  status: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  linkedAccounts: { userId: string; email: string; relation: string; isPrimary: boolean }[];
}

interface UserView {
  id: string;
  email: string;
  isActive: boolean;
}

/**
 * Карточка спортсмена (C4–C5).
 *
 * Отдельно показаны связанные аккаунты: по docs/00-project-overview.md аккаунт
 * не равен карточке спортсмена — у одного спортсмена может быть несколько
 * аккаунтов (например, оба родителя), а один аккаунт может быть связан с
 * несколькими спортсменами.
 */
export default async function AthletePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const { accessToken } = await readTokens();
  const canEdit = user.permissions.includes('athletes.edit');
  // Отдельного права на просмотр списка пользователей в каталоге нет:
  // список доступен тому, кто управляет пользователями.
  const canViewUsers = user.permissions.includes('users.manage');

  const [athlete, users] = await Promise.all([
    apiFetch<AthleteDetails>(`/athletes/${id}`, { accessToken }),
    canEdit && canViewUsers
      ? apiFetch<{ data: UserView[] } | UserView[]>('/users', { accessToken })
      : null,
  ]);

  if (!athlete.ok) {
    if (athlete.error.status === 404) {
      notFound();
    }

    return (
      <AppShell user={user}>
        <PageHeader title="Спортсмен" />
        <Notice tone="error">{describeError(athlete.error)}</Notice>
      </AppShell>
    );
  }

  const allUsers: UserView[] = users?.ok
    ? Array.isArray(users.data)
      ? users.data
      : (users.data.data ?? [])
    : [];
  const linkedUserIds = new Set(athlete.data.linkedAccounts.map((account) => account.userId));
  const availableUsers = allUsers
    .filter((candidate) => candidate.isActive && !linkedUserIds.has(candidate.id))
    .map((candidate) => ({ id: candidate.id, email: candidate.email }));

  return (
    <AppShell user={user}>
      <PageHeader
        title={`${athlete.data.lastName} ${athlete.data.firstName}${
          athlete.data.middleName ? ` ${athlete.data.middleName}` : ''
        }`}
        description={`Статус: ${athlete.data.status} · создан ${athlete.data.createdAt.slice(0, 10)}`}
        actions={
          <Link href="/athletes" className="text-sm text-slate-500 hover:text-slate-900">
            ← Все спортсмены
          </Link>
        }
      />

      {canEdit ? (
        <EditAthleteForm athlete={athlete.data} />
      ) : (
        <Notice>Карточка доступна только для просмотра: нет права «athletes.edit».</Notice>
      )}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Связанные аккаунты</h2>
        <p className="mt-1 text-xs text-slate-500">
          Через аккаунт родитель видит своего спортсмена в приложении.
        </p>

        <table className="mt-3 w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2">Email</th>
              <th className="py-2">Кем является</th>
              <th className="py-2">Основной</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {athlete.data.linkedAccounts.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-sm text-slate-500">
                  Связанных аккаунтов нет
                </td>
              </tr>
            ) : (
              athlete.data.linkedAccounts.map((account) => (
                <tr key={account.userId} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 text-slate-900">{account.email}</td>
                  <td className="py-2 text-slate-600">{account.relation}</td>
                  <td className="py-2 text-slate-600">{account.isPrimary ? 'да' : 'нет'}</td>
                  <td className="py-2 text-right">
                    {canEdit ? (
                      <form action={unlinkAccountAction}>
                        <input type="hidden" name="athleteId" value={athlete.data.id} />
                        <input type="hidden" name="userId" value={account.userId} />
                        <button
                          type="submit"
                          className="text-xs text-slate-500 underline hover:text-red-700"
                        >
                          Снять связь
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {canEdit ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            {!canViewUsers ? (
              <Notice>
                Чтобы связать аккаунт, нужен доступ к списку пользователей (право
                «users.view»): без него выбрать аккаунт не из чего.
              </Notice>
            ) : availableUsers.length > 0 ? (
              <LinkAccountForm athleteId={athlete.data.id} users={availableUsers} />
            ) : (
              <p className="text-xs text-slate-500">
                Свободных аккаунтов нет: все активные пользователи уже связаны
              </p>
            )}
          </div>
        ) : null}
      </section>

      {canEdit && athlete.data.status !== 'ARCHIVED' ? (
        <section className="mt-6 rounded-xl border border-red-100 bg-red-50/50 p-5">
          <h2 className="text-sm font-semibold text-slate-900">Архивирование</h2>
          <p className="mt-1 text-xs text-slate-600">
            Карточка исчезнет из справочников, статус станет ARCHIVED, история
            сохранится.
          </p>
          <form action={archiveAthleteAction} className="mt-3">
            <input type="hidden" name="athleteId" value={athlete.data.id} />
            <button
              type="submit"
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              Архивировать спортсмена
            </button>
          </form>
        </section>
      ) : null}
    </AppShell>
  );
}
