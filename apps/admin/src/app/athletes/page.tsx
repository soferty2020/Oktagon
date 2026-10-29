import { redirect } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { AthletesBoard, type AthleteRow } from './athletes-board';

export const metadata = { title: 'Спортсмены — OCTAGON' };

interface Page {
  items: AthleteRow[];
  total: number;
  page: number;
  limit: number;
}

interface GroupView {
  id: string;
  name: string;
  hallId: string | null;
  isActive: boolean;
}

interface HallView {
  id: string;
  name: string;
  isActive: boolean;
}

const SORTS = ['lastName', 'birthDate', 'status'] as const;
type SortBy = (typeof SORTS)[number];

/**
 * Реестр спортсменов (#81): серверные поиск, фильтры, сортировка и пагинация.
 *
 * Сортировка считается в базе, а не в браузере: иначе на страницу 2 попадали
 * бы не те строки. URL — источник состояния, ссылка на карточку возвращает
 * в список с теми же параметрами.
 */
export default async function AthletesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const sortBy: SortBy = SORTS.includes((params.sortBy ?? '') as SortBy)
    ? ((params.sortBy ?? 'lastName') as SortBy)
    : 'lastName';
  const sortOrder = params.sortOrder === 'desc' ? 'desc' : 'asc';
  const search = (params.search ?? '').trim();
  const { accessToken } = await readTokens();

  const query = new URLSearchParams({
    page: String(page),
    limit: '20',
    sortBy,
    sortOrder,
    ...(search ? { search } : {}),
    ...(params.hallId ? { hallId: params.hallId } : {}),
    ...(params.groupId ? { groupId: params.groupId } : {}),
    ...(params.status ? { status: params.status } : {}),
  });

  const [result, all, groups, halls] = await Promise.all([
    apiFetch<Page>(`/athletes?${query.toString()}`, { accessToken }),
    apiFetch<AthleteRow[]>('/athletes', { accessToken }),
    apiFetch<GroupView[]>('/groups', { accessToken }),
    apiFetch<HallView[]>('/halls', { accessToken }),
  ]);

  const everyone = all.ok ? all.data : [];
  const groupList = (groups.ok ? groups.data : []).filter((group) => group.isActive);

  // Группа спортсмена: имя нужно в таблице, отдельного поля в списке нет (#81).
  const memberships = await Promise.all(
    groupList.map((group) =>
      apiFetch<{ members: { athleteId: string }[] }>(`/groups/${group.id}`, { accessToken }),
    ),
  );
  const groupByAthlete: Record<string, string> = {};
  for (const [index, details] of memberships.entries()) {
    for (const member of details.ok ? details.data.members : []) {
      groupByAthlete[member.athleteId] = groupList[index]?.name ?? '';
    }
  }
  const hallList = (halls.ok ? halls.data : []).filter((hall) => hall.isActive);

  const active = everyone.filter((athlete) => athlete.status === 'ACTIVE').length;
  const archived = everyone.length - active;

  return (
    <AppShell user={user}>
      <PageHeader
        title="Спортсмены"
        description="Реестр спортсменов клуба: поиск, фильтры и карточки."
      />

      <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Всего спортсменов" note="в реестре" value={everyone.length} />
        <Kpi label="Активных" note="участвуют в группах" value={active} />
        <Kpi label="Архивных" note="в архиве" value={archived} />
        <Kpi
          label="Найдено"
          note={search ? `по запросу «${search}»` : 'по фильтрам'}
          value={result.ok ? result.data.total : 0}
        />
      </section>

      {!result.ok ? (
        <p
          className="mt-4 rounded-card border border-line bg-white px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {describeError(result.error)}
        </p>
      ) : null}

      <AthletesBoard
        data={result.ok ? result.data : { items: [], total: 0, page: 1, limit: 20 }}
        groups={groupList.map((group) => ({ id: group.id, name: group.name, hallId: group.hallId }))}
        halls={hallList.map((hall) => ({ id: hall.id, name: hall.name }))}
        groupByAthlete={groupByAthlete}
        params={{
          search,
          hallId: params.hallId ?? '',
          groupId: params.groupId ?? '',
          status: params.status ?? '',
        }}
        sortBy={sortBy}
        sortOrder={sortOrder}
      />
    </AppShell>
  );
}

function Kpi({ label, note, value }: { label: string; note: string; value: number }) {
  return (
    <div className="rounded-card border border-line bg-white px-5 py-4">
      <p className="text-2xl font-semibold leading-none text-ink">{value}</p>
      <p className="mt-2 text-sm text-muted">{label}</p>
      <p className="mt-0.5 text-xs text-muted">{note}</p>
    </div>
  );
}
