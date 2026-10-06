import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { formatAmount, formatCalendarDate, formatMonth, MONTH_NAMES } from '@/lib/money';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { CloseFreezeForm, OpenFreezeForm } from '../../freeze-forms';
import { PeriodRow } from '../../period-forms';
import { CURRENT_YEAR, monthQuery, parseYearMonth } from '../../finance-shared';
import type { PaymentKind } from '@octagon/contracts';

export const metadata = {
  title: 'Финансы спортсмена — OCTAGON',
};

interface AthleteDetails {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  status: string;
}

interface PaymentView {
  id: string;
  kind: PaymentKind;
  amount: number;
  method: string;
  paidAt: string;
  comment: string | null;
  refundedPaymentId: string | null;
  createdAt: string;
}

interface MembershipPeriodView {
  id: string;
  athleteId: string;
  year: number;
  month: number;
  expectedAmount: number | null;
  /** Зачтено: поступления минус возвраты (ADR-0010). */
  paidAmount: number;
  /** Сколько возвращено по периоду (ADR-0010). */
  refundedAmount: number;
  status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'FULLY_PAID_MARKED';
  fullyPaidMarkedAt: string | null;
  note: string | null;
  payments: PaymentView[];
}

interface FreezeView {
  id: string;
  startedOn: string;
  endedOn: string | null;
  reason: string | null;
  isOpen: boolean;
  createdAt: string;
}

/**
 * Карточка финансов спортсмена: периоды, оплаты и заморозки (эпик F).
 *
 * Спецификация: BR-001 (учет по календарным месяцам), BR-002 (произвольная
 * сумма), BR-003 (ручная отметка «оплачен полностью»), BR-005 (заморозка —
 * открытый период), BR-010 (только с явными финансовыми правами).
 *
 * Разделы внутри страницы соответствуют двум разным правам: оплаты —
 * `payments.*`, заморозки — `freezes.*`. Тренеру недоступно и то, и другое, а
 * пользователю с индивидуальной выдачей одного права интерфейс показывает
 * только его раздел: иначе он искал бы причину отказа в своих действиях.
 */
export default async function AthleteFinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const query = await searchParams;
  const now = new Date();
  const fallbackMonth = now.getUTCMonth() + 1;
  const selected = parseYearMonth(query, { year: now.getUTCFullYear(), month: fallbackMonth });
  const year = selected.year;

  const { accessToken } = await readTokens();
  const canViewPayments = user.permissions.includes('payments.view');
  const canEditPayments = user.permissions.includes('payments.edit');
  const canViewFreezes = user.permissions.includes('freezes.view');
  const canEditFreezes = user.permissions.includes('freezes.edit');

  const [athlete, periods, freezes] = await Promise.all([
    apiFetch<AthleteDetails>(`/athletes/${id}`, { accessToken }),
    canViewPayments
      ? apiFetch<MembershipPeriodView[]>(`/athletes/${id}/membership-periods?year=${year}`, {
          accessToken,
        })
      : null,
    canViewFreezes ? apiFetch<FreezeView[]>(`/athletes/${id}/freezes`, { accessToken }) : null,
  ]);

  if (!athlete.ok) {
    if (athlete.error.status === 404) {
      notFound();
    }

    return (
      <AppShell user={user}>
        <PageHeader title="Финансы спортсмена" />
        <Notice tone="error">{describeError(athlete.error)}</Notice>
      </AppShell>
    );
  }

  const name = `${athlete.data.lastName} ${athlete.data.firstName}${
    athlete.data.middleName ? ` ${athlete.data.middleName}` : ''
  }`;

  const yearPeriods = periods?.ok ? periods.data : [];
  const periodByMonth = new Map(yearPeriods.map((period) => [period.month, period]));
  const expectedTotal = yearPeriods.reduce((sum, period) => sum + (period.expectedAmount ?? 0), 0);
  const paidTotal = yearPeriods.reduce((sum, period) => sum + period.paidAmount, 0);
  const refundedTotal = yearPeriods.reduce((sum, period) => sum + period.refundedAmount, 0);
  const openFreeze = (freezes?.ok ? freezes.data : []).find((freeze) => freeze.isOpen) ?? null;

  return (
    <AppShell user={user}>
      <PageHeader
        title={name}
        description={`Статус карточки: ${athlete.data.status} · расчетный год: ${year}`}
        actions={
          <div className="flex flex-col items-end gap-1 text-sm">
            <Link
              href={`/finance?${monthQuery(year, selected.month)}`}
              className="text-slate-500 hover:text-slate-900"
            >
              ← Финансы
            </Link>
            <Link href="/finance/debtors" className="text-slate-500 hover:text-slate-900">
              Должники
            </Link>
            <Link href={`/athletes/${id}`} className="text-slate-500 hover:text-slate-900">
              Карточка спортсмена
            </Link>
          </div>
        }
      />

      {openFreeze ? (
        <div className="mb-6">
          <Notice>
            Спортсмен в заморозке с {formatCalendarDate(openFreeze.startedOn)}
            {openFreeze.reason ? ` (${openFreeze.reason})` : ''}. От задолженности освобождает
            только заморозка, накрывающая начало месяца: задолженность оценивается на первое число
            (BR-004).
          </Notice>
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Расчетные периоды</h2>
            <p className="mt-1 text-xs text-slate-500">
              Период заводится при первом обращении к месяцу: незаведенный месяц виден строкой
              «период не заведен», а не пропуском в списке.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-slate-600">
              за {year}: ожидается{' '}
              <span className="font-medium text-slate-900">{formatAmount(expectedTotal)}</span>,
              зачтено <span className="font-medium text-slate-900">{formatAmount(paidTotal)}</span>
              {refundedTotal > 0 ? (
                <>
                  {', возвращено '}
                  <span className="font-medium text-amber-700">{formatAmount(refundedTotal)}</span>
                </>
              ) : null}
            </span>
            <YearLinks athleteId={id} year={year} />
          </div>
        </div>

        {!canViewPayments ? (
          <div className="p-4">
            <Notice>Оплаты скрыты: нет права «payments.view» (BR-010).</Notice>
          </div>
        ) : periods && !periods.ok ? (
          <div className="p-4">
            <Notice tone="error">{describeError(periods.error)}</Notice>
          </div>
        ) : yearPeriods.length === 0 ? (
          <div className="p-4">
            <Notice>
              За {year} периодов еще нет. Откройте нужный месяц — период создастся, и в него можно
              будет внести оплату.
            </Notice>
            <div className="mt-3 flex flex-wrap gap-2">
              {MonthsToOpen().map((month) => (
                <Link
                  key={month.number}
                  href={`/finance/athletes/${id}?${monthQuery(year, month.number)}#${month.anchor}`}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  {month.name}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {MonthsToOpen().map((month) => {
              const period = periodByMonth.get(month.number);
              if (period) {
                return (
                  <PeriodRow
                    key={period.id}
                    period={period}
                    athleteId={id}
                    canEdit={canEditPayments}
                  />
                );
              }

              return (
                <div
                  key={`open-${month.number}`}
                  id={month.anchor}
                  className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-0"
                >
                  <span className="w-36 text-slate-500">{formatMonth(year, month.number)}</span>
                  <span className="text-xs text-slate-400">период не заведен</span>
                  <Link
                    href={`/finance/athletes/${id}?${monthQuery(year, month.number)}`}
                    className="ml-auto text-xs text-slate-500 underline hover:text-slate-900"
                  >
                    Открыть период
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Заморозки</h2>
          <p className="mt-1 text-xs text-slate-500">
            Заморозка — открытый период приостановления (BR-005). Начало и завершение можно внести
            задним числом: ее часто оформляют, когда спортсмен уже вернулся.
          </p>
        </div>

        {!canViewFreezes ? (
          <div className="p-4">
            <Notice>Заморозки скрыты: нет права «freezes.view» (BR-010).</Notice>
          </div>
        ) : freezes && !freezes.ok ? (
          <div className="p-4">
            <Notice tone="error">{describeError(freezes.error)}</Notice>
          </div>
        ) : (
          <div className="p-4">
            {canEditFreezes && !openFreeze ? (
              <div className="mb-4">
                <OpenFreezeForm athleteId={id} />
              </div>
            ) : null}

            {canEditFreezes && openFreeze ? (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-xs text-slate-700">
                  Открытая заморозка с {formatCalendarDate(openFreeze.startedOn)}. Вторая
                  одновременная заморозка запрещена: сначала завершите текущую.
                </p>
                <div className="mt-2">
                  <CloseFreezeForm
                    freezeId={openFreeze.id}
                    athleteId={id}
                    startedOn={openFreeze.startedOn}
                  />
                </div>
              </div>
            ) : null}

            {!canEditFreezes ? (
              <Notice>Заморозки доступны только для просмотра: нет права «freezes.edit».</Notice>
            ) : null}

            <table className="mt-2 w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2">Начало</th>
                  <th className="py-2">Завершение</th>
                  <th className="py-2">Причина</th>
                  <th className="py-2">Состояние</th>
                </tr>
              </thead>
              <tbody>
                {(freezes?.ok ? freezes.data : []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-sm text-slate-500">
                      Заморозок не было
                    </td>
                  </tr>
                ) : (
                  (freezes?.ok ? freezes.data : []).map((freeze) => (
                    <tr key={freeze.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 text-slate-900">
                        {formatCalendarDate(freeze.startedOn)}
                      </td>
                      <td className="py-2 text-slate-600">
                        {freeze.endedOn ? formatCalendarDate(freeze.endedOn) : 'не завершена'}
                      </td>
                      <td className="py-2 text-slate-600">{freeze.reason ?? '—'}</td>
                      <td className="py-2">
                        <span
                          className={
                            freeze.isOpen
                              ? 'rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700'
                              : 'rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600'
                          }
                        >
                          {freeze.isOpen ? 'открыта' : 'завершена'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          Почему нельзя выбрать статус периода
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Статус выводится из суммы оплат и ручной отметки, а не вводится руками: иначе отметка
          «оплачено» расходилась бы с фактическими поступлениями. Ручная отметка «оплачен полностью»
          (BR-003) имеет приоритет — она ставится именно тогда, когда расчеты шли вне системы.
          Отмена оплаты удаляет запись и пересчитывает период, чтобы ошибка ввода не осталась в
          истории как факт поступления денег.
        </p>
      </section>
    </AppShell>
  );
}

/**
 * Месяцы года по порядку.
 *
 * Показываются все двенадцать: месяц без периода — это не «нет данных», а
 * «период еще не заведен», и открыть его нужно из той же строки.
 */
function MonthsToOpen(): { number: number; name: string; anchor: string }[] {
  return MONTH_NAMES.map((name, index) => ({
    number: index + 1,
    name,
    anchor: `month-${index + 1}`,
  }));
}

/** Переключение года: периоды адресуются годом, месяц — только для ссылки. */
function YearLinks({ athleteId, year }: { athleteId: string; year: number }) {
  const years = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

  return (
    <span className="flex flex-wrap gap-2 text-xs">
      {years.map((value) => (
        <Link
          key={value}
          href={`/finance/athletes/${athleteId}?year=${value}`}
          className={
            value === year
              ? 'rounded-md bg-slate-900 px-2 py-1 text-white'
              : 'rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50'
          }
        >
          {value}
        </Link>
      ))}
    </span>
  );
}
