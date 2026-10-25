import Link from 'next/link';
import { redirect } from 'next/navigation';

import { describePermission } from '@/lib/permissions';
import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { apiFetch, describeError } from '@/lib/api/client';
import { formatAmount, formatMonth } from '@/lib/money';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { monthQuery, parseYearMonth } from '../finance-shared';
import { MonthPicker } from '../month-picker';

export const metadata = {
  title: 'Периоды — OCTAGON',
};

interface PeriodRow {
  athleteId: string;
  firstName: string;
  lastName: string;
  year: number;
  month: number;
  /** Зачтено: поступления минус возвраты (ADR-0010). */
  paidAmount: number;
  /** Сколько возвращено по периоду (ADR-0010). */
  refundedAmount: number;
  expectedAmount: number | null;
  isDebtor: boolean;
  reason: string | null;
}

/**
 * Все расчётные периоды месяца (BR-004).
 *
 * Раньше страница называлась «Должники» и делила список на две таблицы:
 * должники и «не должники». Во второй смешивались оплатившие, замороженные и
 * освобождённые, и отличить «оплатил» от «заморозка» можно было только по
 * причине в мелкой подписи. Вопрос «кто оплатил» не имел ответа ни на одной
 * странице, кроме карточки спортсмена.
 *
 * Теперь один список со статусом: долг, частично, оплачен, заморозка, нет
 * занятий, не активен. Долги идут сверху — их порядок задаёт backend.
 */
export default async function PeriodsPage({
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

  const debts = canView
    ? await apiFetch<PeriodRow[]>(`/debts?${monthQuery(year, month)}`, { accessToken })
    : null;

  const rows = debts?.ok ? debts.data : [];
  const withStatus = rows.map((row) => ({ ...row, status: periodStatus(row) }));

  const counts = {
    total: withStatus.length,
    paid: withStatus.filter((row) => row.status.key === 'paid').length,
    partial: withStatus.filter((row) => row.status.key === 'partial').length,
    debt: withStatus.filter((row) => row.status.key === 'debt').length,
    exempt: withStatus.filter((row) => row.status.key === 'exempt').length,
  };

  const debtTotal = rows.reduce(
    (sum, row) => sum + Math.max((row.expectedAmount ?? 0) - row.paidAmount, 0),
    0,
  );

  return (
    <AppShell user={user}>
      <PageHeader
        title="Периоды"
        description={`Месяц: ${formatMonth(year, month)}. Все периоды: кто оплатил, кто частично, кто в долгу.`}
        actions={
          <Link
            href={`/finance?${monthQuery(year, month)}`}
            className="text-sm text-muted hover:text-ink"
          >
            ← Финансы
          </Link>
        }
      />

      {!canView ? (
        <Notice tone="error">
          Список доступен только с правом: {describePermission('payments.view')} (BR-010).
        </Notice>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <MonthPicker year={year} month={month} />

            <p className="text-sm text-muted">
              Всего: <span className="font-medium text-ink">{counts.total}</span> · оплачено{' '}
              <span className="font-medium text-emerald-700">{counts.paid}</span> · частично{' '}
              <span className="font-medium text-amber-700">{counts.partial}</span> · долг{' '}
              <span className="font-medium text-red-700">{counts.debt}</span> · освобождено{' '}
              <span className="font-medium text-ink">{counts.exempt}</span>
            </p>
          </div>

          {debts && !debts.ok ? (
            <div className="mt-4">
              <Notice tone="error">{describeError(debts.error)}</Notice>
            </div>
          ) : null}

          {debts?.ok && rows.length === 0 ? (
            <div className="mt-4">
              <Notice>
                За {formatMonth(year, month)} нет спортсменов с членством в группе: считать периоды
                не по кому. Это не то же самое, что «все оплатили».
              </Notice>
            </div>
          ) : null}

          <section className="mt-6 rounded-card border border-line bg-white">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Периоды за {formatMonth(year, month)}</h2>
              <p className="text-xs text-muted">
                Недостаёт по ожидаемым суммам: {formatAmount(debtTotal)}
              </p>
            </div>

            {rows.length === 0 ? (
              <EmptyState
                icon="finance"
                title="Периодов за месяц нет"
                description="Период создаётся, когда спортсмен зачислен в группу и в месяце есть занятия."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-3">Спортсмен</th>
                      <th className="px-4 py-3">Ожидается</th>
                      <th className="px-4 py-3">Зачтено</th>
                      <th className="px-4 py-3">Возвращено</th>
                      <th className="px-4 py-3">Статус</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {withStatus.map((row) => (
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
                          <span className={`rounded-full px-2 py-1 text-xs ${row.status.className}`}>
                            {row.status.label}
                          </span>
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}

/**
 * Статус периода.
 *
 * `isDebtor` вычисляет backend (`expected > paid`), поэтому «частично» и «долг»
 * различаются здесь по размеру зачтённой суммы: платить частично и не платить
 * ничего — разные поводы для звонка.
 */
function periodStatus(row: PeriodRow): { key: string; label: string; className: string } {
  if (row.isDebtor) {
    if (row.paidAmount > 0) {
      return { key: 'partial', label: 'Частично', className: 'bg-amber-50 text-amber-700' };
    }

    return { key: 'debt', label: 'Долг', className: 'bg-red-50 text-red-700' };
  }

  switch (row.reason) {
    case 'FROZEN':
      return { key: 'exempt', label: 'Заморозка', className: 'bg-canvas text-muted' };
    case 'NO_TRAININGS_YET':
      return { key: 'exempt', label: 'Нет занятий', className: 'bg-canvas text-muted' };
    case 'INACTIVE':
      return { key: 'exempt', label: 'Не активен', className: 'bg-canvas text-muted' };
    case 'MARKED_FULLY_PAID':
      return { key: 'paid', label: 'Оплачен (отметка)', className: 'bg-emerald-50 text-emerald-700' };
    default:
      return { key: 'paid', label: 'Оплачен', className: 'bg-emerald-50 text-emerald-700' };
  }
}
