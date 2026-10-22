'use client';

import { useActionState, useEffect, useId, useState } from 'react';

import {
  markFullyPaidAction,
  refundPaymentAction,
  updatePeriodAction,
} from '@/app/finance/actions';
import {
  DateInput,
  PeriodStatusBadge,
  StateMessages,
  SubHeading,
  calendarValue,
  labelClass,
  smallButtonClass,
  smallInputClass,
} from '@/app/finance/finance-ui';
import { newIdempotencyKey, paymentMethodLabel } from '@/app/finance/finance-shared';
import {
  EditPaymentForm,
  RecordPaymentForm,
  RefundPaymentForm,
  VoidPaymentForm,
  VoidRefundForm,
} from '@/app/finance/payment-forms';
import { formatCalendarDate, formatMoney, formatMonth } from '@/lib/money';
import type { MembershipPeriodStatus, PaymentKind } from '@octagon/contracts';
import type { FinanceFormState } from '@/app/finance/actions';

const initialState: FinanceFormState = {};

/**
 * Период с движениями средств в том виде, в каком его отдает backend.
 *
 * `paidAmount` — зачтено (нетто): поступления минус возвраты (ADR-0010),
 * поэтому рядом нужен `refundedAmount`, иначе «внесено 0 при возврате 25 000»
 * выглядело бы потерей данных.
 */
export interface PeriodView {
  id: string;
  year: number;
  month: number;
  expectedAmount: number | null;
  paidAmount: number;
  refundedAmount: number;
  status: MembershipPeriodStatus;
  fullyPaidMarkedAt: string | null;
  note: string | null;
  payments: {
    id: string;
    kind: PaymentKind;
    amount: number;
    method: string;
    paidAt: string;
    comment: string | null;
    refundedPaymentId: string | null;
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
      <p className="text-xs text-muted">
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

  // Лента движений: поступления и возвраты. Сумма поступлений нужна отдельно от
  // зачтенной: администратору важно видеть, что «внесено» — это нетто, иначе
  // возврат выглядел бы потерей данных (ADR-0010).
  const received = period.payments
    .filter((movement) => movement.kind === 'PAYMENT')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const refundedByPayment = new Map<string, number>();
  for (const movement of period.payments) {
    if (movement.kind === 'REFUND' && movement.refundedPaymentId) {
      refundedByPayment.set(
        movement.refundedPaymentId,
        (refundedByPayment.get(movement.refundedPaymentId) ?? 0) + movement.amount,
      );
    }
  }
  const movements = period.payments.filter((movement) => movement.kind === 'PAYMENT');

  return (
    <details className="border-b border-line last:border-0">
      <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 text-sm">
        <span className="w-36 font-medium text-ink">
          {formatMonth(period.year, period.month)}
        </span>
        <PeriodStatusBadge status={period.status} />
        <span className="text-muted">
          ожидается {formatMoney(period.expectedAmount)} · зачтено {formatMoney(period.paidAmount)}
        </span>
        {period.refundedAmount > 0 ? (
          <span className="text-xs text-amber-700">
            возвращено {formatMoney(period.refundedAmount)} из {formatMoney(received)}
          </span>
        ) : null}
        {period.fullyPaidMarkedAt ? (
          <span className="text-xs text-emerald-700">отмечен вручную (BR-003)</span>
        ) : null}
        {overpaid !== null ? (
          <span className="text-xs text-amber-700">
            зачтено больше ожидаемого на {formatMoney(overpaid)}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-muted">
          движений: {period.payments.length} · подробнее
        </span>
      </summary>

      <div className="flex flex-col gap-4 bg-canvas/60 px-4 py-4">
        {period.note ? (
          <p className="text-xs text-muted">
            Заметка периода: <span className="text-ink">{period.note}</span>
          </p>
        ) : null}

        <div>
          <SubHeading>Движения средств</SubHeading>

          {period.payments.length === 0 ? (
            <p className="mt-1 text-xs text-muted">
              Поступлений нет: месяц считается неоплаченным.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">
                Лента целиком: поступления и возвраты. Зачтено = поступления − возвраты (ADR-0010).
              </p>

              <ul className="mt-2 flex flex-col gap-2">
                {period.payments.map((movement) => {
                  const isRefund = movement.kind === 'REFUND';
                  const source = isRefund
                    ? period.payments.find(
                        (candidate) => candidate.id === movement.refundedPaymentId,
                      )
                    : null;

                  return (
                    <li
                      key={movement.id}
                      className={
                        isRefund
                          ? 'rounded-card border border-amber-200 bg-amber-50/40 p-3'
                          : 'rounded-card border border-line bg-white p-3'
                      }
                    >
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span
                          className={
                            isRefund
                              ? 'rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800'
                              : 'rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700'
                          }
                        >
                          {isRefund ? 'возврат' : 'поступление'}
                        </span>
                        <span className="font-medium text-ink">
                          {isRefund ? '−' : '+'}
                          {formatMoney(movement.amount)}
                        </span>
                        <span className="text-muted">
                          {formatCalendarDate(movement.paidAt)}
                        </span>
                        <span className="text-xs text-muted">
                          {paymentMethodLabel(movement.method)}
                        </span>
                        {movement.comment ? (
                          <span className="text-xs text-muted">{movement.comment}</span>
                        ) : null}
                        {source ? (
                          <span className="text-xs text-muted">
                            по оплате от {formatCalendarDate(source.paidAt)} на{' '}
                            {formatMoney(source.amount)}
                          </span>
                        ) : null}
                        {canEdit ? (
                          <div className="ml-auto">
                            {isRefund ? (
                              <VoidRefundForm refundId={movement.id} athleteId={athleteId} />
                            ) : (
                              <VoidPaymentForm paymentId={movement.id} athleteId={athleteId} />
                            )}
                          </div>
                        ) : null}
                      </div>

                      {canEdit && !isRefund ? (
                        <div className="mt-2 flex flex-col gap-2">
                          <details>
                            <summary className="cursor-pointer text-xs text-muted hover:text-ink">
                              Изменить оплату
                            </summary>
                            <div className="mt-2">
                              <EditPaymentForm payment={movement} athleteId={athleteId} />
                            </div>
                          </details>

                          <details>
                            <summary className="cursor-pointer text-xs text-muted hover:text-ink">
                              Оформить возврат
                            </summary>
                            <div className="mt-2">
                              <RefundPaymentForm
                                periodId={period.id}
                                athleteId={athleteId}
                                paymentId={movement.id}
                                paymentAmount={movement.amount}
                                alreadyRefunded={refundedByPayment.get(movement.id) ?? 0}
                              />
                            </div>
                          </details>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {canEdit ? (
          <div className="flex flex-col gap-4 border-t border-line pt-4">
            <RecordPaymentForm
              periodId={period.id}
              athleteId={athleteId}
              expectedAmount={period.expectedAmount}
              paidAmount={period.paidAmount}
            />

            <ReturnWithoutPaymentForm
              periodId={period.id}
              athleteId={athleteId}
              available={Math.max(received - period.refundedAmount, 0)}
              hasPayments={movements.length > 0}
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
          <p className="border-t border-line pt-4 text-xs text-muted">
            Доступен только просмотр: нет права «payments.edit».
          </p>
        )}
      </div>
    </details>
  );
}

/**
 * Возврат без привязки к конкретному поступлению.
 *
 * ADR-0010 разрешает корректировку периода: возврат бывает не связан с одной
 * операцией (например, пересчет после соглашения с родителем). Сумма ограничена
 * тем, что осталось от всех поступлений периода.
 */
function ReturnWithoutPaymentForm({
  periodId,
  athleteId,
  available,
  hasPayments,
}: {
  periodId: string;
  athleteId: string;
  available: number;
  hasPayments: boolean;
}) {
  const [state, formAction, pending] = useActionState(refundPaymentAction, initialState);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const refundedAtId = useId();

  useEffect(() => {
    setIdempotencyKey((current) => (current === '' ? newIdempotencyKey() : current));
  }, []);

  if (!hasPayments) {
    return null;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="periodId" value={periodId} />
      <input type="hidden" name="athleteId" value={athleteId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <SubHeading>Возврат без привязки к оплате</SubHeading>
      <div className="flex flex-wrap items-end gap-2">
        <label className={labelClass}>
          Сумма
          <input
            name="amount"
            inputMode="decimal"
            placeholder={String(available)}
            className={`${smallInputClass} w-28`}
          />
        </label>
        <label className={labelClass} htmlFor={refundedAtId}>
          Дата
          <DateInput
            id={refundedAtId}
            name="refundedAt"
            initialValue={calendarValue()}
            className={smallInputClass}
          />
        </label>
        <label className={`${labelClass} flex-1`}>
          Причина
          <input
            name="reason"
            maxLength={500}
            placeholder="корректировка периода"
            className={smallInputClass}
          />
        </label>
        <button type="submit" disabled={pending} className={smallButtonClass}>
          {pending ? '…' : 'Вернуть'}
        </button>
      </div>
      <p className="text-xs text-muted">
        Не больше поступлений периода; доступно {formatMoney(available)}.
      </p>

      <StateMessages state={state} />
    </form>
  );
}
