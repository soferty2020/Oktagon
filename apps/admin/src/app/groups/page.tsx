import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { CreateGroupForm } from './group-forms';

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

interface BranchView {
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
  const canManage = user.permissions.includes('groups.edit');

  const [groups, branches, trainers] = await Promise.all([
    apiFetch<GroupView[]>('/groups', { accessToken }),
    canManage ? apiFetch<BranchView[]>('/branches', { accessToken }) : null,
    canManage ? apiFetch<TrainerView[]>('/trainers', { accessToken }) : null,
  ]);

  const branchOptions = (branches?.ok ? branches.data : [])
    .filter((branch) => branch.isActive)
    .map((branch) => ({ id: branch.id, name: branch.name }));
  const trainerOptions = (trainers?.ok ? trainers.data : [])
    .filter((trainer) => trainer.isActive)
    .map((trainer) => ({ id: trainer.id, displayName: trainer.displayName }));

  return (
    <AppShell user={user}>
      <PageHeader
        title="Группы"
        description="Список ограничен зоной доступа текущего пользователя"
      />

      <div className={canManage ? 'grid gap-6 lg:grid-cols-[2fr_1fr]' : ''}>
        <div className="rounded-card border border-line bg-white">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Название</th>
                <th className="px-4 py-3">Основной филиал</th>
                <th className="px-4 py-3">Участников</th>
                <th className="px-4 py-3">Статус</th>
              </tr>
            </thead>
            <tbody>
              {groups.ok && groups.data.length > 0 ? (
                groups.data.map((group) => (
                  <tr key={group.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/groups/${group.id}`}
                        className="font-medium text-ink underline decoration-line hover:decoration-accent"
                      >
                        {group.name}
                      </Link>
                      {group.description ? (
                        <span className="block text-xs text-muted">{group.description}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {group.primaryBranchName ?? 'не назначен'}
                    </td>
                    <td className="px-4 py-3 text-muted">{group.activeMembersCount}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          group.isActive
                            ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700'
                            : 'rounded-full bg-canvas px-2 py-1 text-xs text-muted'
                        }
                      >
                        {group.isActive ? 'активна' : 'неактивна'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="p-0">
                    {groups.ok ? (
                      <EmptyState
                        icon="groups"
                        title="Групп пока нет"
                        description="Создайте группу справа: в неё записываются спортсмены и строится расписание."
                      />
                    ) : (
                      <div className="px-4 py-6">
                        <Notice tone="error">{describeError(groups.error)}</Notice>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>

        {canManage ? (
          <CreateGroupForm branches={branchOptions} trainers={trainerOptions} />
        ) : null}
      </div>
    </AppShell>
  );
}
