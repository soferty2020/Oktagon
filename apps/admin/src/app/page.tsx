import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { PaidAgainstDebt, ProgressList } from '@/components/charts';
import { Icon } from '@/components/icons';
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

interface Group {
  id: string;
  name: string;
  activeMembersCount: number;
}

interface AttendanceEntry {
  present: number;
  absent: number;
  excused: number;
}

/**
 * Главный экран админки по макету.
 *
 * Четыре KPI с подписью контекста, финансовая сводка полосой и посещаемость по
 * группам. Финансовые блоки показываются только с `payments.view` (BR-010), а
 * без права вместо них выводятся группы и тренеры: пустые «Выручка» и
 * «Задолженность» выглядели бы как нули, а не как отсутствие доступа.
 *
 * Чего здесь нет и почему:
 * - **уведомлений и заявок** — разделов нет в API;
 * - **посещаемости по дням недели** — сводка считается по группе за период.
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

  const [athletes, groups, trainers, finance, sessions] = await Promise.all([
    apiFetch<unknown[]>('/athletes', { accessToken }),
    apiFetch<Group[]>('/groups', { accessToken }),
    apiFetch<unknown[]>('/trainers', { accessToken }),
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

  const upcoming = (sessions.ok ? sessions.data : [])
    .filter((session) => session.status !== 'CANCELLED')
    .slice(0, 5);

  const attendanceByGroup = await loadAttendanceByGroup(groupList, accessToken);
  const averageAttendance =
    attendanceByGroup.items.length === 0
      ? null
      : Math.round(
          attendanceByGroup.items.reduce((sum, item) => sum + item.value, 0) /
            attendanceByGroup.items.length,
        );

  const received = Math.max(
    (financeData?.totals.received ?? 0) - (financeData?.totals.refunded ?? 0),
    0,
  );
  const debt = financeData?.debt ?? 0;

  const stats: readonly KpiCardProps[] = canViewFinance
    ? [
        {
          label: 'Спортсмены',
          value: count(athletes),
          note: 'активных карточек',
          href: '/athletes',
        },
        {
          label: 'Выручка',
          value: formatAmount(received),
          note: `${MONTH_NAMES[month - 1]} ${year}`,
          href: '/finance',
        },
        {
          label: 'Задолженность',
          value: formatAmount(debt),
          note: debt > 0 ? 'требует внимания' : 'долгов нет',
          href: '/finance',
          accent: debt > 0,
        },
        {
          label: 'Посещаемость',
          value: averageAttendance === null ? '—' : `${averageAttendance}%`,
          note: 'за 30 дней',
          href: '/attendance',
        },
      ]
    : [
        { label: 'Спортсмены', value: count(athletes), note: 'активных карточек', href: '/athletes' },
        { label: 'Группы', value: count(groups), note: 'активных', href: '/groups' },
        { label: 'Тренеры', value: count(trainers), note: 'профилей', href: '/trainers' },
        {
          label: 'Посещаемость',
          value: averageAttendance === null ? '—' : `${averageAttendance}%`,
          note: 'за 30 дней',
          href: '/attendance',
        },
      ];

  return (
    <AppShell user={user}>
      <PageHeader
        title="Обзор клуба"
        description="Состояние клуба: спортсмены, занятия, финансы месяца"
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
          <KpiCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-white p-5">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">Посещаемость по группам</h2>
            <span className="text-xs text-muted">за 30 дней</span>
          </div>

          {attendanceByGroup.error ? (
            <p className="text-sm text-danger">{attendanceByGroup.error}</p>
          ) : (
            <ProgressList items={attendanceByGroup.items} />
          )}
        </section>

        {canViewFinance ? (
          <section className="rounded-card border border-line bg-white p-5">
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
              <PaidAgainstDebt
                paid={received}
                debt={debt}
                paidText={formatAmount(received)}
                debtText={formatAmount(debt)}
              />
            )}

            {financeData && financeData.debtorsWithoutExpected > 0 ? (
              <p className="mt-3 text-xs text-muted">
                Должников без заданной суммы: {financeData.debtorsWithoutExpected} — долг не считается
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      <section className="mt-4 rounded-card border border-line bg-white p-5">
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
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Группа</th>
                  <th>Место</th>
                  <th>Тренер</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((session) => (
                  <tr key={session.id}>
                    <td className="font-semibold text-ink">{formatTime(session.startsAt)}</td>
                    <td>{session.groupName}</td>
                    <td className="text-muted">{session.hallName ?? '—'}</td>
                    <td className="text-muted">{session.trainerName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!athletes.ok && !groups.ok && !trainers.ok ? (
        <div className="mt-4">
          <Notice tone="error">
            Не удалось получить данные. Проверьте, что сервер API запущен и доступен.
          </Notice>
        </div>
      ) : null}
    </AppShell>
  );
}

/**
 * KPI-карточка по макету: оранжевая полоса слева, значение и подпись контекста.
 *
 * Иконка в круге заменена полосой: в макете она выполняет ту же роль, но не
 * требует отдельного набора иконок для каждого показателя.
 */
interface KpiCardProps {
  label: string;
  value: string;
  note: string;
  href: string;
  accent?: boolean;
}

function KpiCard({ label, value, note, href, accent = false }: KpiCardProps) {
  return (
    <Link
      href={href}
      className="rounded-card border border-line bg-white p-5 transition hover:border-accent/40"
    >
      <div className="flex items-center gap-3">
        <span className="h-4 w-0.5 rounded-full bg-accent" />
        <span className="text-sm text-muted">{label}</span>
      </div>
      <p
        className={
          accent ? 'mt-3 text-3xl font-extrabold text-accent' : 'mt-3 text-3xl font-extrabold text-ink'
        }
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </Link>
  );
}

/** Количество записей: API отдает массивы, `meta.total` нет. */
function count(result: { ok: boolean; data?: readonly unknown[] }): string {
  return result.ok && result.data ? String(result.data.length) : '—';
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

function shorten(name: string, limit = 16): string {
  return name.length > limit ? `${name.slice(0, limit - 1)}…` : name;
}
