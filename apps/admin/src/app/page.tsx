import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { BarChart, Donut } from '@/components/charts';
import { Icon, type IconName } from '@/components/icons';
import { apiFetch, describeError } from '@/lib/api/client';
import { formatAmount, MONTH_NAMES } from '@/lib/money';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export const metadata = {
  title: 'Главная — OCTAGON',
};

interface FinanceSummary {
  totals: { received: number; refunded: number; revenue: number };
  debtors: number;
  /** Должники без заданной ожидаемой суммы: их долг посчитать нельзя. */
  debtorsWithoutExpected: number;
  debt: number;
  activeAthletes: number;
}

interface TrainingSession {
  id: string;
  groupName: string;
  trainerName: string | null;
  hallName: string | null;
  startsAt: string;
  status: string;
}

interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
}

interface Group {
  id: string;
  name: string;
  activeMembersCount: number;
}

interface Branch {
  id: string;
}

interface AttendanceEntry {
  present: number;
  absent: number;
  excused: number;
}

/**
 * Главный экран админки по макету.
 *
 * Сводка клуба: сколько учеников, групп, тренеров и залов, финансы месяца,
 * посещаемость по группам, ближайшие занятия и дни рождения.
 *
 * Чего здесь нет и почему:
 * - **тренды в KPI-карточках** (в макете — мини-графики): API не отдает историю
 *   по дням, а рисовать фальшивую линию хуже, чем не рисовать;
 * - **уведомлений и заявок**: разделов нет в API;
 * - **посещаемости по дням недели**: сводка считается по группе за период, а не
 *   по дням, поэтому график построен по группам.
 *
 * Финансовая сводка показывается только с `payments.view` (BR-010).
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { accessToken } = await readTokens();
  const canViewFinance = user.permissions.includes('payments.view');
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);

  const [athletes, groups, trainers, branches, finance, sessions] = await Promise.all([
    apiFetch<Athlete[]>('/athletes', { accessToken }),
    apiFetch<Group[]>('/groups', { accessToken }),
    apiFetch<unknown[]>('/trainers', { accessToken }),
    apiFetch<Branch[]>('/branches', { accessToken }),
    canViewFinance
      ? apiFetch<FinanceSummary>(`/finance/summary?year=${year}&month=${month}`, { accessToken })
      : Promise.resolve(null),
    apiFetch<TrainingSession[]>(
      `/training-sessions?from=${now.toISOString()}&to=${weekAhead.toISOString()}`,
      { accessToken },
    ),
  ]);

  const financeData = finance?.ok ? finance.data : null;
  const groupList = groups.ok ? groups.data : [];
  const athleteList = athletes.ok ? athletes.data : [];

  // Залы: отдельного `GET /halls` нет, залы принадлежат филиалам.
  const hallsCount = branches.ok ? await countHalls(branches.data, accessToken) : null;

  const stats: readonly {
    label: string;
    value: string;
    icon: IconName;
    href: string;
  }[] = [
    { label: 'Всего учеников', value: count(athletes), icon: 'athletes', href: '/athletes' },
    { label: 'Активных групп', value: count(groups), icon: 'groups', href: '/groups' },
    { label: 'Тренеров', value: count(trainers), icon: 'trainers', href: '/trainers' },
    {
      label: 'Залов',
      value: hallsCount === null ? '—' : String(hallsCount),
      icon: 'halls',
      href: '/branches',
    },
  ];

  const upcoming = (sessions.ok ? sessions.data : [])
    .filter((session) => session.status !== 'CANCELLED')
    .slice(0, 5);

  const birthdays = upcomingBirthdays(athleteList, 5);
  const attendanceByGroup = await loadAttendanceByGroup(groupList, accessToken);

  return (
    <AppShell user={user}>
      <PageHeader
        title="Обзор клуба"
        description="Состояние клуба: ученики, занятия, финансы месяца"
        actions={
          <Link
            href="/schedule/sessions"
            className="inline-flex items-center gap-1.5 rounded-control bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            <Icon name="plus" size={16} />
            Быстрое действие
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-card border border-line bg-white p-5 transition hover:border-accent/40"
          >
            <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon name={stat.icon} size={18} />
            </span>
            <p className="text-sm text-muted">{stat.label}</p>
            <p className="mt-1 text-3xl font-extrabold text-ink">{stat.value}</p>
          </Link>
        ))}
      </div>

      {canViewFinance ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Link
            href="/finance"
            className="rounded-card border border-line bg-white p-5 transition hover:border-accent/40"
          >
            <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon name="finance" size={18} />
            </span>
            <p className="text-sm text-muted">Долги</p>
            <p
              className={
                financeData && financeData.debt > 0
                  ? 'mt-1 text-3xl font-extrabold text-danger'
                  : 'mt-1 text-3xl font-extrabold text-ink'
              }
            >
              {formatAmount(financeData?.debt ?? 0)}
            </p>
            <p className="mt-1 text-xs text-muted">
              должников: {financeData?.debtors ?? 0}
              {financeData && financeData.debtorsWithoutExpected > 0
                ? ` (без ожидаемой суммы: ${financeData.debtorsWithoutExpected})`
                : ''}
            </p>
          </Link>

          <section className="rounded-card border border-line bg-white p-5 lg:col-span-2">
            <div className="mb-4 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">
                Финансы за {MONTH_NAMES[month - 1]} {year}
              </h2>
              <Link href="/finance" className="text-xs text-accent hover:underline">
                Открыть финансы →
              </Link>
            </div>

            {finance && !finance.ok ? (
              <p className="text-sm text-danger">{describeError(finance.error)}</p>
            ) : (
              <Donut
                centerValue={formatAmount(financeData?.totals.revenue ?? 0)}
                centerLabel="выручка"
                segments={[
                  {
                    label: 'Оплачено',
                    value: Math.max(
                      (financeData?.totals.received ?? 0) - (financeData?.totals.refunded ?? 0),
                      0,
                    ),
                    color: 'var(--color-accent)',
                  },
                  {
                    label: 'Возвраты',
                    value: financeData?.totals.refunded ?? 0,
                    color: 'var(--color-warning)',
                  },
                  {
                    label: 'Долги',
                    value: financeData?.debt ?? 0,
                    color: 'var(--color-danger)',
                  },
                ]}
              />
            )}
          </section>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="rounded-card border border-line bg-white p-5 lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">Посещаемость по группам</h2>
            <span className="text-xs text-muted">за 30 дней</span>
          </div>

          {attendanceByGroup.error ? (
            <p className="text-sm text-danger">{attendanceByGroup.error}</p>
          ) : (
            <BarChart items={attendanceByGroup.items} />
          )}
        </section>

        <section className="rounded-card border border-line bg-white p-5">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">Ближайшие тренировки</h2>
            <Link href="/schedule" className="text-xs text-accent hover:underline">
              Все
            </Link>
          </div>

          {!sessions.ok ? (
            <p className="text-sm text-danger">{describeError(sessions.error)}</p>
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-muted">На неделю занятий не запланировано.</p>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((session) => (
                <li key={session.id} className="flex items-start gap-3 py-2.5">
                  <div className="min-w-14 text-sm font-semibold text-ink">
                    {formatTime(session.startsAt)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{session.groupName}</p>
                    <p className="truncate text-xs text-muted">
                      {[session.trainerName, session.hallName].filter(Boolean).join(' · ') ||
                        'место не указано'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink">Дни рождения</h2>

          {birthdays.length === 0 ? (
            <p className="text-sm text-muted">В ближайшие две недели дней рождения нет.</p>
          ) : (
            <ul className="divide-y divide-line">
              {birthdays.map((athlete) => (
                <li key={athlete.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                    {athlete.firstName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">
                      {athlete.lastName} {athlete.firstName}
                    </p>
                    <p className="text-xs text-muted">{athlete.age} лет</p>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Icon name="gift" size={14} />
                    {athlete.when}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>

      {!athletes.ok && !groups.ok && !trainers.ok ? (
        <div className="mt-4">
          <Notice tone="error">
            Не удалось получить данные. Проверьте, что backend API запущен и доступен по адресу из
            API_BASE_URL.
          </Notice>
        </div>
      ) : null}
    </AppShell>
  );
}

/** Количество записей: API отдает массивы, `meta.total` нет. */
function count(result: { ok: boolean; data?: readonly unknown[] }): string {
  return result.ok && result.data ? String(result.data.length) : '—';
}

/**
 * Число залов по всем филиалам.
 *
 * Отдельного `GET /halls` нет: залы принадлежат филиалам. Запросы идут
 * параллельно; филиалов в клубе единицы, поэтому это дешевле, чем отдельный
 * агрегирующий метод в API.
 */
async function countHalls(
  branches: readonly Branch[],
  accessToken: string | undefined,
): Promise<number | null> {
  if (branches.length === 0) {
    return 0;
  }

  try {
    const results = await Promise.all(
      branches.map((branch) =>
        apiFetch<unknown[]>(`/branches/${branch.id}/halls`, { accessToken }),
      ),
    );

    return results.reduce((sum, result) => sum + (result.ok ? result.data.length : 0), 0);
  } catch {
    return null;
  }
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Almaty',
  });
}

/**
 * Посещаемость по группам: доля посещений от отмеченных занятий.
 *
 * Сводка API считается по одной группе, поэтому запросы идут параллельно по
 * пяти самым большим группам. Больше не нужно: цель — увидеть проблемные группы,
 * а не построить полный отчет (он в разделе «Посещаемость»).
 */
async function loadAttendanceByGroup(
  groups: readonly Group[],
  accessToken: string | undefined,
): Promise<{ items: { label: string; value: number }[]; error?: string }> {
  const top = [...groups]
    .sort((left, right) => right.activeMembersCount - left.activeMembersCount)
    .slice(0, 5);

  if (top.length === 0) {
    return { items: [] };
  }

  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);

  const results = await Promise.all(
    top.map((group) =>
      apiFetch<AttendanceEntry[]>(
        `/attendance/summary?groupId=${group.id}&from=${from.toISOString()}&to=${to.toISOString()}`,
        { accessToken },
      ),
    ),
  );

  const failed = results.find((result) => !result.ok);
  if (failed && !failed.ok) {
    return { items: [], error: describeError(failed.error) };
  }

  const items = top.map((group, index) => {
    const result = results[index];
    if (!result.ok) {
      return { label: shorten(group.name), value: 0 };
    }

    const marked = result.data.reduce(
      (sum, entry) => sum + entry.present + entry.absent + entry.excused,
      0,
    );
    const present = result.data.reduce((sum, entry) => sum + entry.present, 0);

    return {
      label: shorten(group.name),
      value: marked === 0 ? 0 : Math.round((present / marked) * 100),
    };
  });

  return { items };
}

function shorten(name: string, limit = 14): string {
  return name.length > limit ? `${name.slice(0, limit - 1)}…` : name;
}

/**
 * Ближайшие дни рождения: до двух недель вперед.
 *
 * Год рождения не важен для поздравления, поэтому сравнивается день и месяц.
 */
function upcomingBirthdays(
  athletes: readonly Athlete[],
  limit: number,
): { id: string; firstName: string; lastName: string; when: string; age: number }[] {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  const items: {
    id: string;
    firstName: string;
    lastName: string;
    when: string;
    age: number;
    days: number;
  }[] = [];

  for (const athlete of athletes) {
    if (!athlete.birthDate) {
      continue;
    }

    const birth = new Date(athlete.birthDate);
    const next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
    if (next.getTime() < todayStart) {
      next.setFullYear(today.getFullYear() + 1);
    }

    const days = Math.round((next.getTime() - todayStart) / 86_400_000);
    if (days > 14) {
      continue;
    }

    items.push({
      id: athlete.id,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      when: `${next.getDate()} ${MONTH_NAMES[next.getMonth()].toLowerCase()}`,
      age: next.getFullYear() - birth.getFullYear(),
      days,
    });
  }

  return items.sort((left, right) => left.days - right.days).slice(0, limit);
}
