import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { formatAmount, formatMonth } from '@/lib/money';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { debtorExemptionLabel, monthQuery, parseYearMonth } from '../finance-shared';
import { MonthPicker } from '../month-picker';

export const metadata = {
  title: 'Должники — OCTAGON',
};

interface DebtorSummary {
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
 * Список должников за месяц (BR-004).
 *
 * Показаны обе группы: должники сверху (их порядок задает backend) и
 * освобожденные с причиной. Причина возвращается API явно, и показывать только
 * флаг «не должник» было бы хуже: руководитель не отличил бы решение клуба
 * (заморозка, ручная отметка) от отсутствия данных.
 */
export default async function DebtorsPage({
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
    ? await apiFetch<DebtorSummary[]>(`/debts?${monthQuery(year, month)}`, { accessToken })
    : null;

  const rows = debts?.ok ? debts.data : [];
  const debtors = rows.filter((row) => row.isDebtor);
  const exempt = rows.filter((row) => !row.isDebtor);
  const debtTotal = debtors.reduce(
    (sum, row) => sum + Math.max((row.expectedAmount ?? 0) - row.paidAmount, 0),
    0,
  );

  return (
    <AppShell user={user}>
      <PageHeader
        title="Должники"
        description={`Месяц: ${formatMonth(year, month)}. Должники сверху, освобожденные — с причиной.`}
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
        <Notice tone="error">Список доступен только с правом «payments.view» (BR-010).</Notice>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <MonthPicker year={year} month={month} />
            <p className="text-sm text-muted">
              Должников: <span className="font-medium text-ink">{debtors.length}</span> ·
              недостает по ожидаемым суммам:{' '}
              <span className="font-medium text-ink">{formatAmount(debtTotal)}</span>
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
                За {formatMonth(year, month)} нет спортсменов с членством в группе: должников
                считать не по кому. Это не то же самое, что «все оплатили».
              </Notice>
            </div>
          ) : null}

          <DebtorTable
            title="Должники"
            hint="Внесите оплату или отметьте месяц оплаченным в карточке спортсмена"
            rows={debtors}
            year={year}
            month={month}
            emptyText="Должников нет"
          />

          <DebtorTable
            title="Не должники"
            hint="Освобождение — это решение клуба или отсутствие занятий, а не долг"
            rows={exempt}
            year={year}
            month={month}
            emptyText="Все спортсмены месяца — должники"
          />
        </>
      )}
    </AppShell>
  );
}

/** Таблица должников либо освобожденных: одна разметка с разными подписями. */
function DebtorTable({
  title,
  hint,
  rows,
  year,
  month,
  emptyText,
}: {
  title: string;
  hint: string;
  rows: DebtorSummary[];
  year: number;
  month: number;
  emptyText: string;
}) {
  return (
    <section className="mt-6 rounded-card border border-line bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="text-xs text-muted">{hint}</p>
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
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-5 text-sm text-muted">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
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
                  {row.isDebtor ? (
                    <span className="rounded-full bg-red-50 px-2 py-1 text-xs text-red-700">
                      {debtorExemptionLabel(null)}
                    </span>
                  ) : (
                    <span className="rounded-full bg-canvas px-2 py-1 text-xs text-muted">
                      {debtorExemptionLabel(row.reason)}
                    </span>
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
  );
}
