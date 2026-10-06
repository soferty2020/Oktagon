'use client';

import { useActionState } from 'react';

import { markFullyPaidAction, updatePeriodAction } from '@/app/finance/actions';
import {
  PeriodStatusBadge,
  StateMessages,
  SubHeading,
  labelClass,
  smallButtonClass,
  smallInputClass,
} from '@/app/finance/finance-ui';
import { paymentMethodLabel } from '@/app/finance/finance-shared';
import { EditPaymentForm, RecordPaymentForm, VoidPaymentForm } from '@/app/finance/payment-forms';
import { formatCalendarDate, formatMoney, formatMonth } from '@/lib/money';
import type { MembershipPeriodStatus } from '@octagon/contracts';
import type { FinanceFormState } from '@/app/finance/actions';

const initialState: FinanceFormState = {};

/** Период с оплатами в том виде, в каком его отдает backend. */
export interface PeriodView {
  id: string;
  year: number;
  month: number;
  expectedAmount: number | null;
  paidAmount: number;
  status: MembershipPeriodStatus;
  fullyPaidMarkedAt: string | null;
  note: string | null;
  payments: {
    id: string;
    amount: number;
    method: string;
    paidAt: string;
    comment: string | null;
  }[];
}

/** Ожидаемая сумма периода: вводится вручную, поэтому и меняется вручную (BR-002). */
export function ExpectedAmountForm({
  periodId,
  athleteId,
  expectedAmount,
  note,
}: {
  periodId: string;
  athleteId: string;
  expectedAmount: number | null;
  note: string | null;
}) {
  const [state, formAction, pending] = useActionState(updatePeriodAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="periodId" value={periodId} />
      <input type="hidden" name="athleteId" value={athleteId} />
      <SubHeading>Ожидаемая сумма</SubHeading>
      <div className="flex flex-wrap items-end gap-2">
        <label className={labelClass}>
          Сумма
          <input
            name="expectedAmount"
            inputMode="decimal"
            placeholder="не задана"
            defaultValue={expectedAmount ?? ''}
            className={`${smallInputClass} w-28`}
          />
        </label>
        <label className={`${labelClass} flex-1`}>
          Заметка
          <input
            name="note"
            maxLength={500}
            defaultValue={note ?? ''}
            placeholder="причина нестандартной суммы"
            className={smallInputClass}
          />
        </label>
        <button type="submit" disabled={pending} className={smallButtonClass}>
          {pending ? '…' : 'Сохранить'}
        </button>
      </div>
      <StateMessages state={state} />
    </form>
  );
}

/**
 * Ручная отметка «оплачен полностью» (BR-003).
 *
 * Отметка имеет приоритет над суммой: она ставится именно тогда, когда расчеты
 * шли вне системы и сумма в системе не совпадает с фактом.
 */
export function FullyPaidForm({
  periodId,
  athleteId,
  marked,
}: {
  periodId: string;
  athleteId: string;
  marked: boolean;
}) {
  const [state, formAction, pending] = useActionState(markFullyPaidAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="periodId" value={periodId} />
      <input type="hidden" name="athleteId" value={athleteId} />
      <input type="hidden" name="marked" value={marked ? 'false' : 'true'} />
      <SubHeading>Отметка об оплате</SubHeading>
      <button type="submit" disabled={pending} className={smallButtonClass}>
        {pending
          ? '…'
          : marked
            ? 'Снять отметку «оплачен полностью»'
            : 'Отметить оплаченным полностью'}
      </button>
      <p className="text-xs text-slate-500">
        {marked
          ? 'Отметка стоит: месяц считается оплаченным независимо от суммы.'
          : 'Ставится, когда расчеты шли вне системы и сумма в ней не совпадает с фактом.'}
      </p>
      <StateMessages state={state} />
    </form>
  );
}

/**
 * Строка расчетного периода: итог сверху, действия — внутри раскрытия.
 *
 * Свернутый вид показывает месяц, статус и суммы: администратору чаще нужно
 * окинуть взглядом год, а не открывать каждый месяц. Действия внутри раскрытия,
 * иначе двенадцать форм превратили бы страницу в кашу.
 */
export function PeriodRow({
  period,
  athleteId,
  canEdit,
}: {
  period: PeriodView;
  athleteId: string;
  canEdit: boolean;
}) {
  const overpaid =
    period.expectedAmount !== null && period.paidAmount > period.expectedAmount
      ? period.paidAmount - period.expectedAmount
      : null;

  return (
    <details className="border-b border-slate-100 last:border-0">
      <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 text-sm">
        <span className="w-36 font-medium text-slate-900">
          {formatMonth(period.year, period.month)}
        </span>
        <PeriodStatusBadge status={period.status} />
        <span className="text-slate-600">
          ожидается {formatMoney(period.expectedAmount)} · внесено {formatMoney(period.paidAmount)}
        </span>
        {period.fullyPaidMarkedAt ? (
          <span className="text-xs text-emerald-700">отмечен вручную (BR-003)</span>
        ) : null}
        {overpaid !== null ? (
          <span className="text-xs text-amber-700">
            внесено больше ожидаемого на {formatMoney(overpaid)}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-slate-400">
          оплат: {period.payments.length} · подробнее
        </span>
      </summary>

      <div className="flex flex-col gap-4 bg-slate-50/60 px-4 py-4">
        {period.note ? (
          <p className="text-xs text-slate-600">
            Заметка периода: <span className="text-slate-900">{period.note}</span>
          </p>
        ) : null}

        <div>
          <SubHeading>Оплаты</SubHeading>
          {period.payments.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              Поступлений нет: месяц считается неоплаченным.
            </p>
          ) : (
            <ul className="mt-1 flex flex-col gap-2">
              {period.payments.map((payment) => (
                <li key={payment.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium text-slate-900">
                      {formatMoney(payment.amount)}
                    </span>
                    <span className="text-slate-600">{formatCalendarDate(payment.paidAt)}</span>
                    <span className="text-xs text-slate-500">
                      {paymentMethodLabel(payment.method)}
                    </span>
                    {payment.comment ? (
                      <span className="text-xs text-slate-500">{payment.comment}</span>
                    ) : null}
                    {canEdit ? (
                      <div className="ml-auto">
                        <VoidPaymentForm paymentId={payment.id} athleteId={athleteId} />
                      </div>
                    ) : null}
                  </div>

                  {canEdit ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-900">
                        Изменить оплату
                      </summary>
                      <div className="mt-2">
                        <EditPaymentForm payment={payment} athleteId={athleteId} />
                      </div>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {canEdit ? (
          <div className="flex flex-col gap-4 border-t border-slate-200 pt-4">
            <RecordPaymentForm
              periodId={period.id}
              athleteId={athleteId}
              expectedAmount={period.expectedAmount}
              paidAmount={period.paidAmount}
            />
            <ExpectedAmountForm
              periodId={period.id}
              athleteId={athleteId}
              expectedAmount={period.expectedAmount}
              note={period.note}
            />
            <FullyPaidForm
              periodId={period.id}
              athleteId={athleteId}
              marked={period.fullyPaidMarkedAt !== null}
            />
          </div>
        ) : (
          <p className="border-t border-slate-200 pt-4 text-xs text-slate-500">
            Доступен только просмотр: нет права «payments.edit».
          </p>
        )}
      </div>
    </details>
  );
}
