'use client';

import { useActionState } from 'react';

import {
  markAttendanceAction,
  reportAbsenceAction,
  type AttendanceFormState,
} from '@/app/schedule/sessions/[id]/attendance/actions';

const initialState: AttendanceFormState = {};

const inputClass =
  'rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500';
const labelClass = 'flex flex-col gap-1 text-xs font-medium text-slate-600';

/**
 * Отметка спортсмена.
 *
 * Три кнопки вместо выпадающего списка: тренер отмечает на занятии, часто одной
 * рукой, и лишний выбор из списка замедляет работу. Статус передается значением
 * кнопки.
 */
export function MarkForm({
  sessionId,
  athleteId,
  current,
}: {
  sessionId: string;
  athleteId: string;
  current: string | null;
}) {
  const [state, formAction, pending] = useActionState(markAttendanceAction, initialState);

  const statuses = [
    { value: 'PRESENT', label: 'Был', active: 'bg-emerald-600 text-white' },
    { value: 'ABSENT', label: 'Нет', active: 'bg-red-600 text-white' },
    { value: 'EXCUSED', label: 'Уваж.', active: 'bg-amber-500 text-white' },
  ] as const;

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="athleteId" value={athleteId} />

      <div className="flex items-center gap-1">
        <input
          name="comment"
          placeholder="комментарий"
          maxLength={500}
          className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-500"
        />
        {statuses.map((status) => (
          <button
            key={status.value}
            type="submit"
            name="status"
            value={status.value}
            disabled={pending}
            className={`rounded-md px-2 py-1 text-xs font-medium disabled:opacity-60 ${
              current === status.value
                ? status.active
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {status.label}
          </button>
        ))}
      </div>

      {state.error ? (
        <p role="alert" className="max-w-xs text-right text-xs text-red-700">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

/** Предупреждение родителя о планируемом отсутствии (BR-008). */
export function ReportAbsenceForm({
  sessionId,
  athletes,
}: {
  sessionId: string;
  athletes: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(reportAbsenceAction, initialState);

  if (athletes.length === 0) {
    return <p className="text-xs text-slate-500">Все спортсмены уже предупредили об отсутствии</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="sessionId" value={sessionId} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className={`${labelClass} flex-1`}>
          Спортсмен
          <select name="athleteId" required className={inputClass} defaultValue="">
            <option value="" disabled>
              выберите спортсмена
            </option>
            {athletes.map((athlete) => (
              <option key={athlete.id} value={athlete.id}>
                {athlete.name}
              </option>
            ))}
          </select>
        </label>
        <label className={`${labelClass} flex-1`}>
          Причина
          <input name="reason" maxLength={500} className={inputClass} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? '…' : 'Сообщить'}
        </button>
      </div>

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
    </form>
  );
}
