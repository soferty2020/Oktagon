import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { archiveGroupAction, endMembershipAction, unassignTrainerAction } from '../actions';
import { AddMemberForm, AssignTrainerForm, SetGroupHallForm } from '../group-forms';

export const metadata = {
  title: 'Группа — OCTAGON',
};

interface GroupDetails {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  hallId: string | null;
  hallName: string | null;
  activeMembersCount: number;
  trainers: { trainerId: string; displayName: string; isPrimary: boolean; assignedAt: string }[];
  members: {
    athleteId: string;
    firstName: string;
    lastName: string;
    status: string;
    joinedAt: string;
  }[];
}

interface HallView {
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
 * Карточка группы (C6–C8).
 *
 * Здесь видно, что группа может заниматься в нескольких филиалах, а тренеров и
 * участников можно менять по отдельности: список и карточка — разные сценарии.
 */
export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const { accessToken } = await readTokens();
  const [group, halls, trainers] = await Promise.all([
    apiFetch<GroupDetails>(`/groups/${id}`, { accessToken }),
    apiFetch<HallView[]>('/halls', { accessToken }),
    apiFetch<TrainerView[]>('/trainers', { accessToken }),
  ]);

  if (!group.ok) {
    if (group.error.status === 404) {
      notFound();
    }

    return (
      <AppShell user={user}>
        <PageHeader title="Группа" />
        <Notice tone="error">{describeError(group.error)}</Notice>
      </AppShell>
    );
  }

  const canManage = user.permissions.includes('groups.edit');
  const availableHalls = (halls.ok ? halls.data : [])
    .filter((hall) => hall.isActive)
    .map((hall) => ({ id: hall.id, name: hall.name }));

  const assignedTrainerIds = new Set(group.data.trainers.map((trainer) => trainer.trainerId));
  const availableTrainers = (trainers.ok ? trainers.data : [])
    .filter((trainer) => trainer.isActive && !assignedTrainerIds.has(trainer.id))
    .map((trainer) => ({ id: trainer.id, displayName: trainer.displayName }));

  return (
    <AppShell user={user}>
      <PageHeader
        title={group.data.name}
        description={group.data.description ?? 'Группа клуба'}
        actions={
          <Link href="/groups" className="text-sm text-muted hover:text-ink">
            ← Все группы
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-white p-4">
          <p className="text-xs text-muted">Зал</p>
          <p className="mt-1 text-sm font-medium text-ink">
            {group.data.hallName ?? 'не назначен'}
          </p>
        </div>
        <div className="rounded-card border border-line bg-white p-4">
          <p className="text-xs text-muted">Участников</p>
          <p className="mt-1 text-sm font-medium text-ink">
            {group.data.activeMembersCount}
          </p>
        </div>
        <div className="rounded-card border border-line bg-white p-4">
          <p className="text-xs text-muted">Статус</p>
          <p className="mt-1 text-sm font-medium text-ink">
            {group.data.isActive ? 'активна' : 'неактивна'}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-white p-5">
          <h2 className="text-sm font-semibold text-ink">Зал</h2>
          <p className="mt-3 text-sm text-ink">
            {group.data.hallName ?? 'Зал не назначен: группа без площадки'}
          </p>

          {canManage ? (
            <div className="mt-4 border-t border-line pt-4">
              {availableHalls.length > 0 ? (
                <SetGroupHallForm groupId={group.data.id} halls={availableHalls} />
              ) : (
                <p className="text-xs text-muted">
                  Активных залов нет — создайте зал в разделе «Залы»
                </p>
              )}
            </div>
          ) : null}
        </section>

        <section className="rounded-card border border-line bg-white p-5">
          <h2 className="text-sm font-semibold text-ink">Тренеры</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {group.data.trainers.length === 0 ? (
              <li className="text-sm text-muted">Тренеры не назначены</li>
            ) : (
              group.data.trainers.map((trainer) => (
                <li
                  key={trainer.trainerId}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="text-ink">
                    {trainer.displayName}
                    {trainer.isPrimary ? (
                      <span className="ml-2 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                        основной
                      </span>
                    ) : null}
                  </span>
                  {canManage ? (
                    <form action={unassignTrainerAction}>
                      <input type="hidden" name="groupId" value={group.data.id} />
                      <input type="hidden" name="trainerId" value={trainer.trainerId} />
                      <button
                        type="submit"
                        className="text-xs text-muted underline hover:text-red-700"
                      >
                        Снять
                      </button>
                    </form>
                  ) : null}
                </li>
              ))
            )}
          </ul>

          {canManage ? (
            <div className="mt-4 border-t border-line pt-4">
              {availableTrainers.length > 0 ? (
                <AssignTrainerForm groupId={group.data.id} trainers={availableTrainers} />
              ) : (
                <p className="text-xs text-muted">Все активные тренеры уже назначены</p>
              )}
            </div>
          ) : null}
        </section>
      </div>

      <section className="mt-6 rounded-card border border-line bg-white p-5">
        <h2 className="text-sm font-semibold text-ink">Состав</h2>

        <table className="mt-3 w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-2">Спортсмен</th>
              <th className="py-2">Статус</th>
              <th className="py-2">В группе с</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {group.data.members.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-sm text-muted">
                  В группе пока никого нет
                </td>
              </tr>
            ) : (
              group.data.members.map((member) => (
                <tr key={member.athleteId} className="border-b border-line last:border-0">
                  <td className="py-2 font-medium text-ink">
                    {member.lastName} {member.firstName}
                  </td>
                  <td className="py-2">
                    <StatusBadge value={member.status} />
                  </td>
                  <td className="py-2 text-muted">{member.joinedAt}</td>
                  <td className="py-2 text-right">
                    {canManage ? (
                      <form action={endMembershipAction}>
                        <input type="hidden" name="groupId" value={group.data.id} />
                        <input type="hidden" name="athleteId" value={member.athleteId} />
                        <button
                          type="submit"
                          className="text-xs text-muted underline hover:text-red-700"
                        >
                          Завершить членство
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {canManage ? (
          <div className="mt-4 border-t border-line pt-4">
            <AddMemberForm groupId={group.data.id} />
          </div>
        ) : null}
      </section>

      {canManage && group.data.isActive ? (
        <section className="mt-6 rounded-card border border-red-100 bg-red-50/50 p-5">
          <h2 className="text-sm font-semibold text-ink">Архивирование</h2>
          <p className="mt-1 text-xs text-muted">
            Группа исчезнет из справочников, но история членства сохранится.
          </p>
          <form action={archiveGroupAction} className="mt-3">
            <input type="hidden" name="groupId" value={group.data.id} />
            <button
              type="submit"
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              Архивировать группу
            </button>
          </form>
        </section>
      ) : null}
    </AppShell>
  );
}
