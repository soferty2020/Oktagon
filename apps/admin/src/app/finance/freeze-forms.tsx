'use client';

import { useActionState, useId } from 'react';

import { closeFreezeAction, openFreezeAction } from '@/app/finance/actions';
import {
  DateInput,
  StateMessages,
  buttonClass,
  calendarValue,
  inputClass,
  labelClass,
  shiftDays,
} from '@/app/finance/finance-ui';
import { formatCalendarDate } from '@/lib/money';
import type { FinanceFormState } from '@/app/finance/actions';

const initialState: FinanceFormState = {};

/**
 * Открытие заморозки (BR-005).
 *
 * Дата начала по умолчанию — сегодня, но поле можно изменить: заморозку часто
 * оформляют задним числом, когда спортсмен уже вернулся к занятиям.
 */
export function OpenFreezeForm({ athleteId }: { athleteId: string }) {
  const [state, formAction, pending] = useActionState(openFreezeAction, initialState);
  const startedOnId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="athleteId" value={athleteId} />

      <div className="flex flex-wrap items-end gap-2">
        <label className={labelClass} htmlFor={startedOnId}>
          Дата начала
          <DateInput
            id={startedOnId}
            name="startedOn"
            initialValue={calendarValue()}
            className={inputClass}
          />
        </label>
        <label className={`${labelClass} flex-1`}>
          Причина
          <input
            name="reason"
            maxLength={500}
            placeholder="травма, поездка"
            className={inputClass}
          />
        </label>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? '…' : 'Открыть заморозку'}
        </button>
      </div>

      <StateMessages state={state} />
    </form>
  );
}

/**
 * Завершение заморозки: дату окончания тоже можно внести задним числом.
 *
 * По умолчанию предлагается день начала (если он в будущем) либо завтра: дата
 * окончания раньше начала отклоняется сервером, и подставлять заведомо неверное
 * значение нельзя.
 */
export function CloseFreezeForm({
  freezeId,
  athleteId,
  startedOn,
}: {
  freezeId: string;
  athleteId: string;
  startedOn: string;
}) {
  const [state, formAction, pending] = useActionState(closeFreezeAction, initialState);
  const endedOnId = useId();
  const suggestedEnd = startedOn > calendarValue() ? startedOn : shiftDays(1);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="freezeId" value={freezeId} />
      <input type="hidden" name="athleteId" value={athleteId} />

      <label className={labelClass} htmlFor={endedOnId}>
        Дата завершения
        <DateInput
          id={endedOnId}
          name="endedOn"
          min={startedOn}
          initialValue={suggestedEnd}
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? '…' : 'Завершить заморозку'}
      </button>
      <p className="w-full text-xs text-muted">
        Начало: {formatCalendarDate(startedOn)}. Дату завершения можно указать задним числом.
      </p>

      <div className="w-full">
        <StateMessages state={state} />
      </div>
    </form>
  );
}
