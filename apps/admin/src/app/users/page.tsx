import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
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
      />

      <div className="rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
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
                <tr key={candidate.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">
                      {candidate.lastName} {candidate.firstName}
                    </span>
                    <span className="block text-xs text-slate-500">{candidate.email}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{candidate.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        candidate.status === 'ACTIVE'
                          ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700'
                          : 'rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500'
                      }
                    >
                      {candidate.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {candidate.scopeAllGroups ? 'все группы' : 'только назначенные'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManagePermissions ? (
                      <Link
                        href={`/users/${candidate.id}/permissions`}
                        className="text-xs text-slate-500 underline hover:text-slate-900"
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
        <p className="mt-3 text-xs text-slate-500">
          Всего пользователей: {result.data.meta.total}
        </p>
      ) : null}
    </AppShell>
  );
}
