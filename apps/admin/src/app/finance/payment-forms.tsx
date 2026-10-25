'use client';

import { useActionState, useEffect, useId, useState } from 'react';

import { ConfirmButton } from '@/components/confirm-button';
import {
  recordPaymentAction,
  refundPaymentAction,
  updatePaymentAction,
  voidPaymentAction,
  voidRefundAction,
} from '@/app/finance/actions';
import {
  DateInput,
  StateMessages,
  SubHeading,
  calendarValue,
  labelClass,
  smallButtonClass,
  smallInputClass,
} from '@/app/finance/finance-ui';
import { newIdempotencyKey, paymentMethodLabel } from '@/app/finance/finance-shared';
import { formatMoney } from '@/lib/money';
import type { PaymentMethod } from '@octagon/contracts';
import type { FinanceFormState } from '@/app/finance/actions';

const initialState: FinanceFormState = {};

/** Способы оплаты заданы контрактом (`PaymentMethod`). */
const PAYMENT_METHODS: readonly PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'OTHER'];

/**
 * Внесение оплаты.
 *
 * Сумма произвольная (BR-002): для спортсмена, пришедшего в середине месяца, она
 * может быть любой. Ключ идемпотентности создается один раз после монтирования
 * формы, поэтому повторная отправка не создаст вторую оплату, а серверная и
 * клиентская разметка не расходятся.
 */
export function RecordPaymentForm({
  periodId,
  athleteId,
  expectedAmount,
  paidAmount,
}: {
  periodId: string;
  athleteId: string;
  expectedAmount: number | null;
  paidAmount: number;
}) {
  const [state, formAction, pending] = useActionState(recordPaymentAction, initialState);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const paidAtId = useId();

  useEffect(() => {
    setIdempotencyKey((current) => (current === '' ? newIdempotencyKey() : current));
  }, []);

  const remaining = expectedAmount === null ? null : Math.max(expectedAmount - paidAmount, 0);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="periodId" value={periodId} />
      <input type="hidden" name="athleteId" value={athleteId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <SubHeading>
        Внести оплату
        {remaining !== null && remaining > 0 ? ` · осталось ${formatMoney(remaining)}` : ''}
      </SubHeading>

      <div className="flex flex-wrap items-end gap-2">
        <label className={labelClass}>
          Сумма
          <input
            name="amount"
            required
            inputMode="decimal"
            placeholder="25000"
            className={`${smallInputClass} w-24`}
          />
        </label>
        <label className={labelClass}>
          Способ
          <select name="method" defaultValue="CASH" className={smallInputClass}>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {paymentMethodLabel(method)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass} htmlFor={paidAtId}>
          Дата
          <DateInput
            id={paidAtId}
            name="paidAt"
            initialValue={calendarValue()}
            className={smallInputClass}
          />
        </label>
        <label className={`${labelClass} flex-1`}>
          Комментарий
          <input name="comment" maxLength={500} className={smallInputClass} />
        </label>
        <button type="submit" disabled={pending} className={smallButtonClass}>
          {pending ? '…' : 'Внести'}
        </button>
      </div>

      <StateMessages state={state} />
    </form>
  );
}

/** Изменение внесенной оплаты: сумму вводят вручную, и ошибки неизбежны. */
export function EditPaymentForm({
  payment,
  athleteId,
}: {
  payment: { id: string; amount: number; method: string; paidAt: string; comment: string | null };
  athleteId: string;
}) {
  const [state, formAction, pending] = useActionState(updatePaymentAction, initialState);
  const paidAtId = useId();

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="paymentId" value={payment.id} />
      <input type="hidden" name="athleteId" value={athleteId} />

      <label className={labelClass}>
        Сумма
        <input
          name="amount"
          required
          inputMode="decimal"
          defaultValue={payment.amount}
          className={`${smallInputClass} w-24`}
        />
      </label>
      <label className={labelClass}>
        Способ
        <select name="method" defaultValue={payment.method} className={smallInputClass}>
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {paymentMethodLabel(method)}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass} htmlFor={paidAtId}>
        Дата
        <DateInput
          id={paidAtId}
          name="paidAt"
          initialValue={payment.paidAt.slice(0, 10)}
          className={smallInputClass}
        />
      </label>
      <label className={`${labelClass} flex-1`}>
        Комментарий
        <input
          name="comment"
          maxLength={500}
          defaultValue={payment.comment ?? ''}
          className={smallInputClass}
        />
      </label>
      <button type="submit" disabled={pending} className={smallButtonClass}>
        {pending ? '…' : 'Изменить'}
      </button>
      <div className="w-full">
        <StateMessages state={state} />
      </div>
    </form>
  );
}

/**
 * Отмена ошибочной оплаты.
 *
 * Запись удаляется, а период пересчитывается: ошибка ввода не должна оставаться
 * в истории как факт поступления денег. Кнопка отделена от «изменить» и требует
 * подтверждения, потому что действие необратимо.
 */
export function VoidPaymentForm({
  paymentId,
  athleteId,
}: {
  paymentId: string;
  athleteId: string;
}) {
  return (
    <form action={voidPaymentAction}>
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="athleteId" value={athleteId} />
      <ConfirmButton
        confirmTitle="Отменить оплату?"
        confirmText="Запись будет удалена, период пересчитан. Действие попадёт в журнал."
        confirmLabel="Отменить оплату"
        className="text-xs text-muted underline hover:text-red-700"
      >
        Отменить оплату
      </ConfirmButton>
    </form>
  );
}

/**
 * Возврат денег по поступлению (ADR-0010).
 *
 * Возврат не удаляет поступление: он фиксирует, что деньги были получены и
 * возвращены. Поэтому форма открывается из строки конкретного поступления, а
 * сумма ограничена его остатком — вернуть больше, чем получено по этой оплате,
 * нельзя.
 */
export function RefundPaymentForm({
  periodId,
  athleteId,
  paymentId,
  paymentAmount,
  alreadyRefunded,
}: {
  periodId: string;
  athleteId: string;
  paymentId: string;
  paymentAmount: number;
  alreadyRefunded: number;
}) {
  const [state, formAction, pending] = useActionState(refundPaymentAction, initialState);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const refundedAtId = useId();

  useEffect(() => {
    setIdempotencyKey((current) => (current === '' ? newIdempotencyKey() : current));
  }, []);

  const available = Math.max(paymentAmount - alreadyRefunded, 0);

  if (available <= 0) {
    return (
      <p className="text-xs text-muted">
        По этой оплате возвращено все: оформить новый возврат нельзя.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="periodId" value={periodId} />
      <input type="hidden" name="athleteId" value={athleteId} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div className="flex flex-wrap items-end gap-2">
        <label className={labelClass}>
          Сумма возврата
          <input
            name="amount"
            required
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
            placeholder="спортсмен ушел из клуба"
            className={smallInputClass}
          />
        </label>
        <button type="submit" disabled={pending} className={smallButtonClass}>
          {pending ? '…' : 'Оформить возврат'}
        </button>
      </div>

      <p className="text-xs text-muted">
        Доступно к возврату: {formatMoney(available)}. Зачтенная сумма периода уменьшится.
      </p>

      <StateMessages state={state} />
    </form>
  );
}

/** Отмена ошибочно оформленного возврата. */
export function VoidRefundForm({ refundId, athleteId }: { refundId: string; athleteId: string }) {
  return (
    <form
      action={voidRefundAction}
      onSubmit={(event) => {
        if (!confirm('Отменить возврат? Запись будет удалена, зачтенная сумма вернется.')) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="refundId" value={refundId} />
      <input type="hidden" name="athleteId" value={athleteId} />
      <button type="submit" className="text-xs text-muted underline hover:text-red-700">
        Отменить возврат
      </button>
    </form>
  );
}
