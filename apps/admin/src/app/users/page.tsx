import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export const metadata = {
  title: 'Пользователи — OCTAGON',
};

interface UserView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  role: string;
  status: string;
  scopeAllGroups: boolean;
  createdAt: string;
}

interface PaginatedUsers {
  items: UserView[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

/**
 * Список пользователей.
 *
 * Доступен с правом `users.manage`: отдельного права на просмотр в каталоге
 * нет (docs/04-roles-permissions.md).
 */
export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { accessToken } = await readTokens();
  const canView = user.permissions.includes('users.manage');
  const canManagePermissions = user.permissions.includes('permissions.manage');

  if (!canView) {
    return (
      <AppShell user={user}>
        <PageHeader title="Пользователи" />
        <Notice>Раздел доступен с правом «users.manage».</Notice>
      </AppShell>
    );
  }

  const result = await apiFetch<PaginatedUsers>('/users?perPage=100', { accessToken });

  return (
    <AppShell user={user}>
      <PageHeader
        title="Пользователи"
        description="Роли, статусы и индивидуальные права"
        actions={
          <Link href="/users/invites" className="text-sm text-muted hover:text-ink">
            Приглашения →
          </Link>
        }
      />

      <div className="rounded-card border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Пользователь</th>
              <th className="px-4 py-3">Роль</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Доступ к группам</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {result.ok && result.data.items.length > 0 ? (
              result.data.items.map((candidate) => (
                <tr key={candidate.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink">
                      {candidate.lastName} {candidate.firstName}
                    </span>
                    <span className="block text-xs text-muted">{candidate.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={candidate.role} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={candidate.status} />
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {candidate.scopeAllGroups ? 'все группы' : 'только назначенные'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManagePermissions ? (
                      <Link
                        href={`/users/${candidate.id}/permissions`}
                        className="text-xs text-muted underline hover:text-ink"
                      >
                        Права
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-6">
                  <Notice>
                    {result.ok ? 'Пользователи не найдены' : describeError(result.error)}
                  </Notice>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {result.ok ? (
        <p className="mt-3 text-xs text-muted">Всего пользователей: {result.data.meta.total}</p>
      ) : null}
    </AppShell>
  );
}
