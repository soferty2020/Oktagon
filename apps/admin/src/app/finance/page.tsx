import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { formatAmount, formatMonth } from '@/lib/money';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { PeriodStatusBadge } from './finance-ui';
import { monthQuery, parseYearMonth } from './finance-shared';
import { MonthPicker } from './month-picker';

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
  expectedAmount: number | null;
  isDebtor: boolean;
  reason: string | null;
}

interface AthleteView {
  id: string;
  status: string;
}

/**
 * Финансы: сводка месяца и переходы в рабочие экраны (эпик F).
 *
 * Спецификация: BR-001 (учет по календарным месяцам), BR-004 (признаки
 * должника и причины освобождения), BR-010 (финансы видит только пользователь
 * с явным правом — ни одна роль, кроме суперадмина, его не имеет).
 *
 * Здесь нет таблицы периодов: месяца без оплат в ней просто не существует,
 * поэтому сводка считается по должникам, а работа с периодом ведется в карточке
 * спортсмена.
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

  const [debts, athletes] = canView
    ? await Promise.all([
        apiFetch<DebtorSummary[]>(`/debts?${monthQuery(year, month)}`, { accessToken }),
        apiFetch<AthleteView[] | { items?: AthleteView[] }>('/athletes?status=ACTIVE', {
          accessToken,
        }),
      ])
    : [null, null];

  if (!canView) {
    return (
      <AppShell user={user}>
        <PageHeader title="Финансы" />
        <Notice tone="error">
          Раздел доступен только с правом «payments.view» (BR-010). Права выдаются в разделе
          «Пользователи».
        </Notice>
      </AppShell>
    );
  }

  const rows = debts?.ok ? debts.data : [];
  const debtors = rows.filter((row) => row.isDebtor);
  const expectedTotal = debtors.reduce((sum, row) => sum + (row.expectedAmount ?? 0), 0);
  const paidTotal = debtors.reduce((sum, row) => sum + row.paidAmount, 0);
  const missingPeriods = debtors.filter((row) => row.expectedAmount === null).length;
  const activeAthletes = athletes?.ok
    ? Array.isArray(athletes.data)
      ? athletes.data.length
      : (athletes.data.items ?? []).length
    : null;

  return (
    <AppShell user={user}>
      <PageHeader
        title="Финансы"
        description={`Расчетный месяц: ${formatMonth(year, month)}. Учет ведется по календарным месяцам (BR-001).`}
        actions={
          <Link
            href={`/finance/debtors?${monthQuery(year, month)}`}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            Все должники и освобождения →
          </Link>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <MonthPicker year={year} month={month} />
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/finance/freezes" className="text-slate-600 underline hover:text-slate-900">
            Заморозки
          </Link>
          <Link href="/athletes" className="text-slate-600 underline hover:text-slate-900">
            Спортсмены
          </Link>
        </div>
      </div>

      {debts && !debts.ok ? (
        <div className="mt-4">
          <Notice tone="error">{describeError(debts.error)}</Notice>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Должников"
          value={String(debtors.length)}
          note={`с членством в месяце: ${rows.length}`}
        />
        <SummaryCard
          title="Ожидается к оплате"
          value={formatAmount(expectedTotal)}
          note={
            missingPeriods > 0 ? `без заданной суммы: ${missingPeriods}` : 'ожидание задано у всех'
          }
        />
        <SummaryCard
          title="Внесено должниками"
          value={formatAmount(paidTotal)}
          note="частичные оплаты учтены"
        />
        <SummaryCard
          title="Активных спортсменов"
          value={activeAthletes === null ? '—' : String(activeAthletes)}
          note="по карточкам со статусом ACTIVE"
        />
      </div>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Должники за {formatMonth(year, month)}
          </h2>
          {canEdit ? (
            <span className="text-xs text-slate-500">Оплата вносится в карточке спортсмена</span>
          ) : (
            <span className="text-xs text-slate-500">
              Только просмотр: нет права «payments.edit»
            </span>
          )}
        </div>

        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Спортсмен</th>
              <th className="px-4 py-3">Ожидается</th>
              <th className="px-4 py-3">Внесено</th>
              <th className="px-4 py-3">Состояние</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {debtors.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6">
                  <Notice>
                    Должников за {formatMonth(year, month)} нет. Это может означать, что оплаты
                    внесены, месяцы отмечены оплаченными, спортсмены в заморозке или занятий в
                    месяце еще не было — причины видны в списке должников.
                  </Notice>
                </td>
              </tr>
            ) : (
              debtors.map((row) => (
                <tr key={row.athleteId} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/finance/athletes/${row.athleteId}?${monthQuery(year, month)}`}
                      className="font-medium text-slate-900 underline decoration-slate-300 hover:decoration-slate-900"
                    >
                      {row.lastName} {row.firstName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatAmount(row.expectedAmount)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatAmount(row.paidAmount)}</td>
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
                      className="text-slate-500 underline hover:text-slate-900"
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

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          Как считается задолженность (BR-004)
        </h2>
        <p className="mt-1 text-sm text-slate-600">
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
function SummaryCard({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}
