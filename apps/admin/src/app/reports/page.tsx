import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { secondaryButtonClass } from '@/components/ui';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export const metadata = {
  title: 'Отчёты — OCTAGON',
};

interface FinanceSummary {
  year: number;
  month: number;
  totals: { received: number; refunded: number; revenue: number };
  expected: number;
  debtors: number;
  debtorsWithoutExpected: number;
  debt: number;
  activeAthletes: number;
  branches: { branchId: string | null; name: string; received: number; debt: number }[];
}

interface DynamicsPoint {
  year: number;
  month: number;
  revenue: number;
  debt: number;
  debtors: number;
}

interface EventView {
  id: string;
  status: string;
  participantsCount: number;
}

interface CompetitionView {
  id: string;
  status: string;
  participantsCount: number;
}

const MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

/** Деньги: без копеек, с пробелами между разрядами. */
function money(value: number): string {
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

/**
 * Отчёты — сводка без новых API.
 *
 * Данные уже отдают `/finance/summary`, `/finance/dynamics`, мероприятия и
 * турниры. Отдельный раздел нужен, потому что по этим цифрам принимают решения
 * (сколько должников, сколько турниров провели), а искать их по трём разделам
 * неудобно.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;

  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const canSeeFinance = user.permissions.includes('payments.view');
  const canSeeSports =
    user.permissions.includes('attestations.view') || user.permissions.includes('competitions.view');

  if (!canSeeFinance && !canSeeSports) {
    return (
      <AppShell user={user}>
        <PageHeader title="Отчёты" />
        <Notice tone="info">
          Отчёты собираются из финансов и спортивных мероприятий. Нужен доступ хотя бы к одному
          из разделов.
        </Notice>
      </AppShell>
    );
  }

  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  // Месяц по умолчанию — прошлый: текущий ещё не закончился, и «итог» по нему
  // вводит в заблуждение.
  const month = Number(params.month) || (now.getMonth() === 0 ? 12 : now.getMonth());

  const { accessToken } = await readTokens();
  if (!accessToken) {
    redirect('/login');
  }

  const [summary, dynamics, events, competitions] = await Promise.all([
    canSeeFinance
      ? apiFetch<FinanceSummary>(`/finance/summary?year=${year}&month=${month}`, { accessToken })
      : Promise.resolve(null),
    canSeeFinance
      ? apiFetch<{ points: DynamicsPoint[] }>(
          `/finance/dynamics?year=${year}&month=${month}`,
          { accessToken },
        )
      : Promise.resolve(null),
    canSeeSports
      ? apiFetch<EventView[]>('/certification-events', { accessToken })
      : Promise.resolve(null),
    canSeeSports
      ? apiFetch<CompetitionView[]>('/competitions', { accessToken })
      : Promise.resolve(null),
  ]);

  const summaryOk = summary?.ok ? summary.data : null;
  const points = dynamics?.ok ? dynamics.data.points : [];
  const eventRows = events?.ok ? events.data : [];
  const competitionRows = competitions?.ok ? competitions.data : [];

  const published = eventRows.filter((item) => item.status === 'PUBLISHED').length;
  const eventParticipants = eventRows.reduce((sum, item) => sum + item.participantsCount, 0);
  const publishedCompetitions = competitionRows.filter((item) => item.status === 'PUBLISHED').length;
  const competitionParticipants = competitionRows.reduce(
    (sum, item) => sum + item.participantsCount,
    0,
  );

  return (
    <AppShell user={user}>
      <PageHeader
        title="Отчёты"
        description={`${MONTHS[month - 1]} ${year}: деньги и спортивные итоги`}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Link className={secondaryButtonClass} href="/finance">
          Финансы
        </Link>
        <Link className={secondaryButtonClass} href="/finance/debtors">
          Периоды
        </Link>
        {canSeeSports ? (
          <Link className={secondaryButtonClass} href="/attestations">
            Аттестации
          </Link>
        ) : null}
        {canSeeSports ? (
          <Link className={secondaryButtonClass} href="/competitions">
            Соревнования
          </Link>
        ) : null}
      </div>

      {summaryOk ? (
        <>
          <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Поступления" value={money(summaryOk.totals.received)} />
            <Kpi label="Ожидалось" value={money(summaryOk.expected)} />
            <Kpi label="Долг" value={money(summaryOk.debt)} tone={summaryOk.debt > 0 ? 'danger' : 'neutral'} />
            <Kpi
              label="Должников"
              value={String(summaryOk.debtors)}
              hint={
                summaryOk.debtorsWithoutExpected > 0
                  ? `${summaryOk.debtorsWithoutExpected} без расчётного периода`
                  : undefined
              }
            />
          </section>

          {summaryOk.branches.length > 0 ? (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                По филиалам
              </h2>
              <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-200 text-neutral-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Филиал</th>
                      <th className="px-4 py-3 font-medium">Поступления</th>
                      <th className="px-4 py-3 font-medium">Долг</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryOk.branches.map((branch) => (
                      <tr
                        className="border-b border-neutral-100 last:border-0"
                        key={branch.branchId ?? branch.name}
                      >
                        <td className="px-4 py-3 font-medium">{branch.name}</td>
                        <td className="px-4 py-3">{money(branch.received)}</td>
                        <td className="px-4 py-3">{money(branch.debt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {points.length > 0 ? (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Динамика за полгода
              </h2>
              <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-200 text-neutral-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Месяц</th>
                      <th className="px-4 py-3 font-medium">Выручка</th>
                      <th className="px-4 py-3 font-medium">Долг</th>
                      <th className="px-4 py-3 font-medium">Должников</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((point) => (
                      <tr
                        className="border-b border-neutral-100 last:border-0"
                        key={`${point.year}-${point.month}`}
                      >
                        <td className="px-4 py-3">
                          {MONTHS[point.month - 1]} {point.year}
                        </td>
                        <td className="px-4 py-3">{money(point.revenue)}</td>
                        <td className="px-4 py-3">{money(point.debt)}</td>
                        <td className="px-4 py-3">{point.debtors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : canSeeFinance && summary && !summary.ok ? (
        <Notice tone="info">{describeError(summary.error)}</Notice>
      ) : null}

      {canSeeSports ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Спорт
          </h2>
          {eventRows.length === 0 && competitionRows.length === 0 ? (
            <EmptyState
              title="Пока нечего считать"
              description="Здесь появятся итоги, когда пройдут аттестации и турниры."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Аттестаций" value={String(eventRows.length)} hint={`${published} опубликовано`} />
              <Kpi label="Участников аттестаций" value={String(eventParticipants)} />
              <Kpi
                label="Турниров"
                value={String(competitionRows.length)}
                hint={`${publishedCompetitions} опубликовано`}
              />
              <Kpi label="Заявок на турниры" value={String(competitionParticipants)} />
            </div>
          )}
        </section>
      ) : null}
    </AppShell>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === 'danger' ? 'text-red-600' : ''}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-sm text-neutral-500">{hint}</p> : null}
    </div>
  );
}
