import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export const metadata = {
  title: 'Группы — OCTAGON',
};

interface GroupView {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  primaryBranchName: string | null;
  activeMembersCount: number;
}

/**
 * Справочник групп (C6).
 *
 * Список приходит уже ограниченным scope: тренер видит только свои группы
 * (docs/21-permission-matrix.md).
 */
export default async function GroupsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { accessToken } = await readTokens();
  const result = await apiFetch<GroupView[]>('/groups', { accessToken });

  return (
    <AppShell user={user}>
      <PageHeader
        title="Группы"
        description="Список ограничен зоной доступа текущего пользователя"
      />

      <div className="rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Название</th>
              <th className="px-4 py-3">Основной филиал</th>
              <th className="px-4 py-3">Участников</th>
              <th className="px-4 py-3">Статус</th>
            </tr>
          </thead>
          <tbody>
            {result.ok && result.data.length > 0 ? (
              result.data.map((group) => (
                <tr key={group.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">{group.name}</span>
                    {group.description ? (
                      <span className="block text-xs text-slate-500">{group.description}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {group.primaryBranchName ?? 'не назначен'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{group.activeMembersCount}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        group.isActive
                          ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700'
                          : 'rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500'
                      }
                    >
                      {group.isActive ? 'активна' : 'неактивна'}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-6">
                  <Notice>
                    {result.ok
                      ? 'Групп пока нет либо они вне вашей зоны доступа.'
                      : describeError(result.error)}
                  </Notice>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
