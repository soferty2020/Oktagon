import { describePermission } from '@/lib/permissions';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { formatAmount, formatMonth } from '@/lib/money';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { PeriodStatusBadge } from './finance-ui';
import { isoMonthEnd, isoMonthStart, monthQuery, parseYearMonth } from './finance-shared';
import { MonthPicker } from './month-picker';
import { DynamicsTable, type DynamicsPoint } from './dynamics';

export const metadata = {
  title: 'Финансы — OCTAGON',
};

interface DebtorSummary {
  athleteId: string;
  firstName: string;
  lastName: string;
  year: number;
  month: number;
  paidAmount: number;
  refundedAmount: number;
  expectedAmount: number | null;
  isDebtor: boolean;
  reason: string | null;
}

interface FinanceSummary {
  year: number;
  month: number;
  totals: { received: number; refunded: number; revenue: number };
  expected: number;
  debtors: number;
  debtorsWithoutExpected: number;
  debt: number;
  activeAthletes: number;
  branches: {
    branchId: string | null;
    branchName: string;
    received: number;
    refunded: number;
    revenue: number;
    debtors: number;
    debt: number;
  }[];
}

/**
 * Финансы: сводка месяца, сравнение филиалов и должники (эпик F, F8).
 *
 * Спецификация: BR-001 (учет по календарным месяцам), BR-004 (признаки должника
 * и причины освобождения), BR-010 (финансы видит только пользователь с явным
 * правом — ни одна роль, кроме суперадмина, его не имеет).
 *
 * В сводке два разных знаменателя, и в интерфейсе они подписаны явно:
 * **выручка** — по датам движений («сколько денег прошло в этом месяце»),
 * **задолженность** — по расчетному месяцу (BR-004). Смешивать их нельзя: иначе
 * руководитель увидел бы «выручку», которой в кассе не было.
 */
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const params = await searchParams;
  const now = new Date();
  const { year, month } = parseYearMonth(params, {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
  });

  const { accessToken } = await readTokens();
  const canView = user.permissions.includes('payments.view');
  const canEdit = user.permissions.includes('payments.edit');

  const [summary, debts, dynamics] = canView
    ? await Promise.all([
        apiFetch<FinanceSummary>(`/finance/summary?${monthQuery(year, month)}`, { accessToken }),
        apiFetch<DebtorSummary[]>(`/debts?${monthQuery(year, month)}`, { accessToken }),
        apiFetch<{ points: DynamicsPoint[] }>(
          `/finance/dynamics?${monthQuery(year, month)}&months=6`,
          { accessToken },
        ),
      ])
    : [null, null, null];

  if (!canView) {
    return (
      <AppShell user={user}>
        <PageHeader title="Финансы" />
        <Notice tone="error">
          Раздел доступен только с правом: {describePermission('payments.view')} (BR-010). Права выдаются в разделе
          «Пользователи».
        </Notice>
      </AppShell>
    );
  }

  const rows = debts?.ok ? debts.data : [];
  const debtors = rows.filter((row) => row.isDebtor);
  const data = summary?.ok ? summary.data : null;
  const branchRows = data?.branches ?? [];
  // Масштаб для полосок сравнения: самый крупный филиал задает ширину.
  const maxBranchRevenue = branchRows.reduce(
    (max, branch) => Math.max(max, Math.abs(branch.revenue)),
    0,
  );
  const maxBranchDebt = branchRows.reduce((max, branch) => Math.max(max, branch.debt), 0);

  return (
    <AppShell user={user}>
      <PageHeader
        title="Финансы"
        description={`Месяц: ${formatMonth(year, month)}. Выручка — по датам движений, задолженность — по расчетному месяцу (BR-004).`}
        actions={
          <Link
            href={`/finance/debtors?${monthQuery(year, month)}`}
            className="text-sm text-muted hover:text-ink"
          >
            Все должники и освобождения →
          </Link>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <MonthPicker year={year} month={month} />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/finance/freezes" className="text-muted underline hover:text-ink">
            Заморозки
          </Link>
          <Link href="/athletes" className="text-muted underline hover:text-ink">
            Спортсмены
          </Link>
          {/* Скачивание через серверный роут: он читает сессию из cookie. */}
          <a
            href={`/api/export/debts?${monthQuery(year, month)}`}
            className="rounded-md border border-line px-2 py-1 text-muted hover:text-ink"
          >
            Должники CSV
          </a>
          <a
            href={`/api/export/payments?from=${isoMonthStart(year, month)}&to=${isoMonthEnd(year, month)}`}
            className="rounded-md border border-line px-2 py-1 text-muted hover:text-ink"
          >
            Оплаты CSV
          </a>
        </div>
      </div>

      {summary && !summary.ok ? (
        <div className="mt-4">
          <Notice tone="error">{describeError(summary.error)}</Notice>
        </div>
      ) : null}
      {debts && !debts.ok ? (
        <div className="mt-4">
          <Notice tone="error">{describeError(debts.error)}</Notice>
        </div>
      ) : null}

      {dynamics?.ok && dynamics.data.points.length > 0 ? (
        <div className="mt-6">
          <DynamicsTable points={dynamics.data.points} />
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Поступления"
          value={formatAmount(data?.totals.received ?? 0)}
          note={
            data && data.totals.refunded > 0
              ? `возвраты ${formatAmount(data.totals.refunded)}`
              : 'за выбранный месяц'
          }
        />
        <SummaryCard
          title="Задолженность"
          value={formatAmount(data?.debt ?? 0)}
          note={
            data && data.debtorsWithoutExpected > 0
              ? `без заданной суммы: ${data.debtorsWithoutExpected}`
              : `ожидается за месяц: ${formatAmount(data?.expected ?? 0)}`
          }
          tone={data && data.debt > 0 ? 'alert' : 'default'}
        />
        <SummaryCard
          title="Оплачено периодов"
          value={String(rows.filter((row) => !row.isDebtor).length)}
          note={`всего периодов: ${rows.length}`}
        />
        <SummaryCard
          title="Не оплачено"
          value={String(data?.debtors ?? debtors.length)}
          note={data && data.debtors > 0 ? 'требует внимания' : 'все оплачено'}
          tone={data && data.debtors > 0 ? 'alert' : 'default'}
        />
      </div>

      <section className="mt-8 rounded-card border border-line bg-white">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Сравнение филиалов</h2>
          <p className="text-xs text-muted">
            Выручка — по филиалу группы спортсмена; задолженность — по должникам филиала
          </p>
        </div>

        {branchRows.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted">
            За {formatMonth(year, month)} нет ни движений средств, ни должников: сравнивать филиалы
            не по чему.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Филиал</th>
                <th className="px-4 py-3">Выручка</th>
                <th className="px-4 py-3">Поступления</th>
                <th className="px-4 py-3">Возвраты</th>
                <th className="px-4 py-3">Должников</th>
                <th className="px-4 py-3">Задолженность</th>
              </tr>
            </thead>
            <tbody>
              {branchRows.map((branch) => (
                <tr
                  key={branch.branchId ?? 'no-branch'}
                  className="border-b border-line last:border-0"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink">{branch.branchName}</span>
                    {branch.branchId === null ? (
                      <span className="mt-1 block text-xs text-muted">
                        филиал не назначен — суммы не отнесены к филиалам
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">
                    {formatAmount(branch.revenue)}
                    <ScaleBar
                      value={branch.revenue}
                      max={maxBranchRevenue}
                      color={branch.revenue < 0 ? 'bg-red-400' : 'bg-emerald-500'}
                    />
                  </td>
                  <td className="px-4 py-3 text-muted">{formatAmount(branch.received)}</td>
                  <td className="px-4 py-3 text-muted">
                    {branch.refunded > 0 ? (
                      <span className="text-amber-700">{formatAmount(branch.refunded)}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{branch.debtors}</td>
                  <td className="px-4 py-3">
                    {branch.debt > 0 ? (
                      <>
                        <span className="text-red-700">{formatAmount(branch.debt)}</span>
                        <ScaleBar value={branch.debt} max={maxBranchDebt} color="bg-red-400" />
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-8 rounded-card border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">
            Должники за {formatMonth(year, month)}
          </h2>
          {canEdit ? (
            <span className="text-xs text-muted">Оплата вносится в карточке спортсмена</span>
          ) : (
            <span className="text-xs text-muted">
              Только просмотр: нет права: {describePermission('payments.edit')}
            </span>
          )}
        </div>

        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Спортсмен</th>
              <th className="px-4 py-3">Ожидается</th>
              <th className="px-4 py-3">Зачтено</th>
              <th className="px-4 py-3">Возвращено</th>
              <th className="px-4 py-3">Состояние</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {debtors.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6">
                  <Notice>
                    Должников за {formatMonth(year, month)} нет. Это может означать, что оплаты
                    внесены, месяцы отмечены оплаченными, спортсмены в заморозке или занятий в
                    месяце еще не было — причины видны в списке должников.
                  </Notice>
                </td>
              </tr>
            ) : (
              debtors.map((row) => (
                <tr key={row.athleteId} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/finance/athletes/${row.athleteId}?${monthQuery(year, month)}`}
                      className="font-medium text-ink underline decoration-line hover:decoration-accent"
                    >
                      {row.lastName} {row.firstName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {row.expectedAmount === null ? (
                      <span className="text-amber-700">не задана</span>
                    ) : (
                      formatAmount(row.expectedAmount)
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{formatAmount(row.paidAmount)}</td>
                  <td className="px-4 py-3 text-muted">
                    {row.refundedAmount > 0 ? (
                      <span className="text-amber-700">{formatAmount(row.refundedAmount)}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.paidAmount > 0 ? (
                      <PeriodStatusBadge status="PARTIALLY_PAID" />
                    ) : (
                      <PeriodStatusBadge status="UNPAID" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    <Link
                      href={`/finance/athletes/${row.athleteId}?${monthQuery(year, month)}`}
                      className="text-muted underline hover:text-ink"
                    >
                      Открыть период
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="mt-6 rounded-card border border-line bg-white p-5">
        <h2 className="text-sm font-semibold text-ink">
          Как считается задолженность (BR-004)
        </h2>
        <p className="mt-1 text-sm text-muted">
          Спортсмен попадает в должники, только если он активен, месяц не отмечен оплаченным
          вручную, в месяце уже была хотя бы одна тренировка его группы и он не в заморозке.
          Задолженность оценивается на начало месяца, поэтому заморозка освобождает от нее, только
          если накрывает первое число. Причины освобождения показаны в списке должников явно: «в
          заморозке» или «отмечен оплаченным» — это решение клуба, а не отсутствие данных.
        </p>
      </section>
    </AppShell>
  );
}

/** Карточка сводки: одно число и короткое пояснение к нему. */
function SummaryCard({
  title,
  value,
  note,
  tone = 'default',
}: {
  title: string;
  value: string;
  note: string;
  tone?: 'default' | 'alert';
}) {
  return (
    <div className="rounded-card border border-line bg-white p-5">
      <p className="text-sm text-muted">{title}</p>
      <p
        className={
          tone === 'alert'
            ? 'mt-2 text-2xl font-semibold text-red-700'
            : 'mt-2 text-2xl font-semibold text-ink'
        }
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}

/**
 * Полоска масштаба рядом с суммой.
 *
 * Сравнивать филиалы числами в столбце неудобно: разницу видно только при
 * чтении. Полоска показывает долю от самого крупного филиала, а знак сохраняется
 * — отрицательная выручка (возвратов больше, чем поступлений) остается заметной.
 */
function ScaleBar({ value, max, color }: { value: number; max: number; color: string }) {
  if (max <= 0 || value === 0) {
    return null;
  }

  const share = Math.min(Math.abs(value) / max, 1);

  return (
    <span className="mt-2 block h-1.5 w-full rounded-full bg-canvas">
      <span
        className={`block h-1.5 rounded-full ${color}`}
        style={{ width: `${Math.round(share * 100)}%` }}
      />
    </span>
  );
}
