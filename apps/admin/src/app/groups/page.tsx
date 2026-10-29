import { redirect } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { AssignAthleteForm } from './group-forms';
import { formatSchedule, GroupsBoard } from './groups-board';

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
  trainers: { id: string; displayName: string }[];
}

interface HallView {
  id: string;
  name: string;
  address: string | null;
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

interface SlotView {
  weekday: string;
  startTime: string;
  endTime: string;
}

interface TemplateView {
  groupId: string;
  slots: SlotView[];
}

/**
 * Группы клуба (C6): залы, состав и расписание.
 *
 * Список приходит уже ограниченным scope: тренер видит только свои группы
 * (docs/21-permission-matrix.md). Поиск идёт в API (`?search=`), чтобы не
 * ограничиваться загруженной страницей; зал, тренер и статус фильтруются в
 * браузере — эти поля есть у каждой группы.
 */
export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ assign?: string; search?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { assign, search } = await searchParams;
  const query = (search ?? '').trim();
  const { accessToken } = await readTokens();
  const canManage = user.permissions.includes('groups.edit');

  const [groups, halls, trainers, templates, assigned] = await Promise.all([
    apiFetch<GroupView[]>(`/groups${query ? `?search=${encodeURIComponent(query)}` : ''}`, {
      accessToken,
    }),
    apiFetch<HallView[]>('/halls', { accessToken }),
    apiFetch<TrainerView[]>('/trainers', { accessToken }),
    apiFetch<TemplateView[]>('/schedule-templates', { accessToken }),
    assign ? apiFetch<AthleteView>(`/athletes/${assign}`, { accessToken }) : null,
  ]);

  const groupList = groups.ok ? groups.data : [];
  const hallList = (halls.ok ? halls.data : []).filter((hall) => hall.isActive);
  const trainerList = (trainers.ok ? trainers.data : []).filter((trainer) => trainer.isActive);
  const templateByGroup = new Map(
    (templates.ok ? templates.data : []).map((template) => [
      template.groupId,
      template.slots.map((slot) => ({
        weekday: slot.weekday,
        start: slot.startTime.slice(0, 5),
        end: slot.endTime.slice(0, 5),
      })),
    ]),
  );

  const items = groupList.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    isActive: group.isActive,
    hallId: group.hallId,
    hallName: group.hallName,
    activeMembersCount: group.activeMembersCount,
    trainers: group.trainers ?? [],
    schedule: formatSchedule(templateByGroup.get(group.id) ?? []),
  }));

  const activeGroups = items.filter((group) => group.isActive);
  const athletesTotal = activeGroups.reduce((sum, group) => sum + group.activeMembersCount, 0);
  const withoutTrainer = activeGroups.filter((group) => group.trainers.length === 0).length;

  return (
    <AppShell user={user}>
      <PageHeader
        title="Группы"
        description="Учебные группы клуба: тренеры, состав и расписание по залам."
      />

      {assigned?.ok && canManage ? (
        <div className="mt-4">
          <AssignAthleteForm
            athlete={assigned.data}
            groups={groupList.map((group) => ({
              id: group.id,
              name: group.name,
              hallName: group.hallName,
            }))}
          />
        </div>
      ) : null}

      {!groups.ok ? (
        <p className="mt-4 rounded-card border border-line bg-white px-4 py-3 text-sm text-danger">
          {describeError(groups.error)}
        </p>
      ) : null}

      <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Всего групп" note={`в ${hallList.length} залах`} value={activeGroups.length} />
        <Kpi label="Всего спортсменов" note="во всех группах" value={athletesTotal} />
        <Kpi label="Без тренера" note="нужно назначить" tone="warn" value={withoutTrainer} />
      </section>

      <GroupsBoard
        canManage={canManage}
        groups={items}
        halls={hallList.map((hall) => ({ id: hall.id, name: hall.name, address: hall.address }))}
        search={query}
        trainers={trainerList.map((trainer) => ({ id: trainer.id, name: trainer.displayName }))}
      />
    </AppShell>
  );
}

/** Показатель в шапке: число и подпись, без декоративных иконок. */
function Kpi({
  label,
  note,
  value,
  tone,
}: {
  label: string;
  note: string;
  value: number;
  tone?: 'warn';
}) {
  return (
    <div className="rounded-card border border-line bg-white px-5 py-4">
      <p
        className={`text-2xl font-semibold leading-none ${
          tone === 'warn' ? 'text-accent-text' : 'text-ink'
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-sm text-muted">{label}</p>
      <p className="mt-0.5 text-xs text-muted">{note}</p>
    </div>
  );
}
