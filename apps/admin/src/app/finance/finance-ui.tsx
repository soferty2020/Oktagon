'use client';

import { useEffect, useState } from 'react';

import type { FinanceFormState } from '@/app/finance/actions';
import type { MembershipPeriodStatus } from '@octagon/contracts';

/**
 * Общая разметка финансовых форм.
 *
 * Вынесено отдельно, чтобы периоды, оплаты и заморозки не повторяли одни и те же
 * классы и подписи: расхождение в оформлении тут заметно сразу, потому что формы
 * стоят рядом на одной странице.
 */

export const inputClass =
  'rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent';
export const smallInputClass =
  'rounded-md border border-line px-2 py-1 text-xs outline-none focus:border-accent';
export const labelClass = 'flex flex-col gap-1 text-xs font-medium text-muted';
export const buttonClass =
  'rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60';
export const smallButtonClass =
  'rounded-md border border-line bg-white px-3 py-1 text-xs text-ink hover:bg-canvas disabled:opacity-60';

/**
 * Подписи статуса периода.
 *
 * Статус не вводится руками: FULLY_PAID_MARKED — ручная отметка (BR-003),
 * остальные выведены из суммы оплат. Здесь только человеческие названия.
 */
const PERIOD_STATUS: Readonly<
  Record<MembershipPeriodStatus, { label: string; className: string }>
> = {
  UNPAID: { label: 'не оплачен', className: 'bg-red-50 text-red-700' },
  PARTIALLY_PAID: { label: 'частично', className: 'bg-amber-50 text-amber-700' },
  PAID: { label: 'оплачен', className: 'bg-emerald-50 text-emerald-700' },
  FULLY_PAID_MARKED: { label: 'отмечен оплаченным', className: 'bg-emerald-50 text-emerald-700' },
};

/** Подпись и цвет статуса периода: статус выведен из оплат, а не задан вручную. */
export function PeriodStatusBadge({ status }: { status: MembershipPeriodStatus }) {
  const badge = PERIOD_STATUS[status];
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs ${badge?.className ?? 'bg-canvas text-muted'}`}
    >
      {badge?.label ?? status}
    </span>
  );
}

/** Календарная дата в формате input[type=date]: локальный день, не UTC. */
export function calendarValue(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function shiftDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return calendarValue(date);
}

/** Ошибка или подтверждение операции: одинаково для всех финансовых форм. */
export function StateMessages({ state }: { state: FinanceFormState }) {
  return (
    <>
      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {state.success}
        </p>
      ) : null}
    </>
  );
}

/** Подпись группы полей внутри формы. */
export function SubHeading({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-muted">{children}</p>;
}

/**
 * Поле даты с подстановкой значения после монтирования.
 *
 * «Сегодня» на сервере и в браузере — разные моменты (и разные часовые пояса),
 * поэтому вычисленная при отрисовке дата давала бы расхождение гидратации.
 * До монтирования поле пустое, значение ставится эффектом; `required` при этом
 * не мешает: браузер проверяет форму в момент отправки.
 *
 * `id` нужен, чтобы подпись (`label htmlFor`) была связана с полем: внутри
 * компонента связь по вложенности не видна ни линтеру, ни скринридеру.
 */
export function DateInput({
  id,
  name,
  min,
  initialValue,
  className,
}: {
  id: string;
  name: string;
  min?: string;
  initialValue: string | null;
  className: string;
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!initialValue) {
      return;
    }
    setValue((current) => (current === '' ? initialValue : current));
  }, [initialValue]);

  return (
    <input
      id={id}
      type="date"
      name={name}
      {...(min ? { min } : {})}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      className={className}
    />
  );
}
