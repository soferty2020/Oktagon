import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { AssignAthleteForm, CreateGroupForm } from './group-forms';

export const metadata = {
  title: 'Группы — OCTAGON',
};

interface GroupView {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  hallId: string | null;
  hallName: string | null;
  activeMembersCount: number;
  /** Тренеры группы: основной первым. */
  trainers: { id: string; displayName: string }[];
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

interface AthleteView {
  id: string;
  firstName: string;
  lastName: string;
}

/**
 * Справочник групп (C6).
 *
 * Список приходит уже ограниченным scope: тренер видит только свои группы
 * (docs/21-permission-matrix.md).
 */
export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ assign?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { assign } = await searchParams;
  const { accessToken } = await readTokens();
  const canManage = user.permissions.includes('groups.edit');

  const [groups, halls, trainers, assigned] = await Promise.all([
    apiFetch<GroupView[]>('/groups', { accessToken }),
    canManage ? apiFetch<HallView[]>('/halls', { accessToken }) : null,
    canManage ? apiFetch<TrainerView[]>('/trainers', { accessToken }) : null,
    // Спортсмен из ссылки «Не в группе» (#68): показываем его карточку в форме.
    assign ? apiFetch<AthleteView>(`/athletes/${assign}`, { accessToken }) : null,
  ]);

  const hallOptions = (halls?.ok ? halls.data : [])
    .filter((hall) => hall.isActive)
    .map((hall) => ({ id: hall.id, name: hall.name }));
  const trainerOptions = (trainers?.ok ? trainers.data : [])
    .filter((trainer) => trainer.isActive)
    .map((trainer) => ({ id: trainer.id, displayName: trainer.displayName }));

  const groupOptions = (groups.ok ? groups.data : []).map((group) => ({
    id: group.id,
    name: group.name,
    hallName: group.hallName,
  }));

  return (
    <AppShell user={user}>
      <PageHeader
        title="Группы"
        description="Список ограничен зоной доступа текущего пользователя"
      />

      {assigned?.ok && canManage ? (
        <div className="mb-6">
          <AssignAthleteForm
            athlete={assigned.data}
            groups={groupOptions}
          />
        </div>
      ) : null}

      {assigned && !assigned.ok ? (
        <div className="mb-6">
          <Notice tone="error">{describeError(assigned.error)}</Notice>
        </div>
      ) : null}

      <div className={canManage ? 'grid gap-6 lg:grid-cols-[2fr_1fr]' : ''}>
        <div className="flex flex-col gap-6">
          {!groups.ok ? <Notice tone="error">{describeError(groups.error)}</Notice> : null}

          {groups.ok && groups.data.length === 0 ? (
            <div className="rounded-card border border-line bg-white">
              <EmptyState
                icon="groups"
                title="Групп пока нет"
                description="Создайте группу справа: в неё записываются спортсмены и строится расписание."
              />
            </div>
          ) : null}

          {groups.ok
            ? hallSections(groups.data).map((section) => (
                <section
                  className="rounded-card border border-line bg-white"
                  key={section.key}
                >
                  {/* Зал — заголовок секции, а не колонка: иначе группы разных
                      залов висят одной простынёй (#71). */}
                  <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <div>
                      <h2 className="text-sm font-semibold text-ink">{section.name}</h2>
                      <p className="mt-0.5 text-xs text-muted">
                        {section.groups.length}{' '}
                        {section.groups.length === 1 ? 'группа' : 'групп'}
                      </p>
                    </div>
                    {section.hallId ? (
                      <Link
                        className="text-xs text-muted underline hover:text-ink"
                        href={`/halls#hall-${section.hallId}`}
                      >
                        Зал
                      </Link>
                    ) : null}
                  </header>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                        <tr>
                          <th className="px-4 py-3">Название</th>
                          <th className="px-4 py-3">Тренер</th>
                          <th className="px-4 py-3">Участников</th>
                          <th className="px-4 py-3">Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.groups.map((group) => (
                          <tr key={group.id} className="border-b border-line last:border-0">
                            <td className="px-4 py-3">
                              <Link
                                className="font-medium text-ink underline decoration-line hover:decoration-accent"
                                href={`/groups/${group.id}`}
                              >
                                {group.name}
                              </Link>
                              {group.description ? (
                                <span className="block text-xs text-muted">
                                  {group.description}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-muted">
                              {group.trainers.length > 0
                                ? group.trainers.map((trainer) => trainer.displayName).join(', ')
                                : 'не назначен'}
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
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))
            : null}
        </div>

        {canManage ? (
          <CreateGroupForm halls={hallOptions} trainers={trainerOptions} />
        ) : null}
      </div>
    </AppShell>
  );
}

/**
 * Группы, разложенные по залам.
 *
 * Группа без зала попадает в отдельную секцию: это не ошибка, но её нужно
 * видеть — иначе группа потеряется среди назначенных.
 */
function hallSections(groups: GroupView[]) {
  const sections = new Map<
    string,
    { key: string; name: string; hallId: string | null; groups: GroupView[] }
  >();

  for (const group of groups) {
    const key = group.hallId ?? '__none__';
    const existing = sections.get(key) ?? {
      key,
      name: group.hallName ?? 'Без зала',
      hallId: group.hallId,
      groups: [],
    };
    existing.groups.push(group);
    sections.set(key, existing);
  }

  return [...sections.values()].sort((left, right) => {
    // «Без зала» — в конце: это исключение, а не основной список.
    if (left.hallId === null) return 1;
    if (right.hallId === null) return -1;
    return left.name.localeCompare(right.name);
  });
}
