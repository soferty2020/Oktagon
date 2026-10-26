'use client';

import { useActionState } from 'react';
import { RANKS } from '@octagon/contracts';

import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/components/ui';
import {
  addParticipantAction,
  createEventAction,
  recordResultAction,
  type AttestationFormState,
} from './actions';

const initial: AttestationFormState = {};

/** Дата и время в формате `datetime-local`: без секунд и зоны. */
function localDateTime(offsetDays = 7): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Создание мероприятия: дата по умолчанию — через неделю. */
export function CreateEventForm() {
  const [state, formAction, pending] = useActionState(createEventAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className={labelClass} htmlFor="title">
          Название
        </label>
        <input
          className={fieldClass}
          id="title"
          name="title"
          placeholder="Осенняя аттестация"
          required
          minLength={3}
        />
        {state.fieldErrors?.title ? (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.title}</p>
        ) : null}
      </div>

      <div>
        <label className={labelClass} htmlFor="scheduledAt">
          Дата и время
        </label>
        <input
          className={fieldClass}
          id="scheduledAt"
          name="scheduledAt"
          type="datetime-local"
          defaultValue={localDateTime()}
          required
        />
        {state.fieldErrors?.scheduledAt ? (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.scheduledAt}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="location">
            Место
          </label>
          <input className={fieldClass} id="location" name="location" placeholder="Зал 1" />
        </div>
        <div>
          <label className={labelClass} htmlFor="organizer">
            Организатор
          </label>
          <input className={fieldClass} id="organizer" name="organizer" placeholder="Федерация" />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="description">
          Описание
        </label>
        <textarea
          className={fieldClass}
          id="description"
          name="description"
          rows={3}
          placeholder="Что нужно взять, во сколько сбор"
        />
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-green-700">{state.success}</p> : null}

      <button className={primaryButtonClass} type="submit" disabled={pending}>
        {pending ? 'Создаём…' : 'Создать мероприятие'}
      </button>
    </form>
  );
}

/** Добавление участника: спортсмен и целевая ступень. */
export function AddParticipantForm({
  eventId,
  athletes,
}: {
  eventId: string;
  athletes: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    addParticipantAction.bind(null, eventId),
    initial,
  );

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <label className={labelClass} htmlFor="athleteId">
          Спортсмен
        </label>
        <select className={fieldClass} id="athleteId" name="athleteId" required>
          <option value="">Выберите</option>
          {athletes.map((athlete) => (
            <option key={athlete.id} value={athlete.id}>
              {athlete.label}
            </option>
          ))}
        </select>
        {state.fieldErrors?.athleteId ? (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.athleteId}</p>
        ) : null}
      </div>

      <div>
        <label className={labelClass} htmlFor="targetRank">
          Ступень
        </label>
        <select className={fieldClass} id="targetRank" name="targetRank" required>
          {RANKS.map((rank) => (
            <option key={rank.id} value={rank.id}>
              {rank.label}
            </option>
          ))}
        </select>
      </div>

      <button className={primaryButtonClass} type="submit" disabled={pending}>
        {pending ? 'Добавляем…' : 'Добавить'}
      </button>

      {state.error ? <p className="sm:col-span-3 text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}

/** Итог участника. */
export function ResultForm({
  eventId,
  athleteId,
  current,
}: {
  eventId: string;
  athleteId: string;
  current: { result: string; awardedRank: string | null; resultComment: string | null };
}) {
  const [state, formAction, pending] = useActionState(
    recordResultAction.bind(null, eventId, athleteId),
    initial,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`result-${athleteId}`}>
            Итог
          </label>
          <select
            className={fieldClass}
            id={`result-${athleteId}`}
            name="result"
            defaultValue={current.result}
            required
          >
            <option value="PENDING">Не сдавал</option>
            <option value="PASSED">Сдал</option>
            <option value="FAILED">Не сдал</option>
            <option value="NO_SHOW">Не явился</option>
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor={`rank-${athleteId}`}>
            Присвоенная ступень
          </label>
          <select
            className={fieldClass}
            id={`rank-${athleteId}`}
            name="awardedRank"
            defaultValue={current.awardedRank ?? ''}
          >
            <option value="">По целевой ступени</option>
            {RANKS.map((rank) => (
              <option key={rank.id} value={rank.id}>
                {rank.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor={`comment-${athleteId}`}>
          Комментарий
        </label>
        <input
          className={fieldClass}
          id={`comment-${athleteId}`}
          name="comment"
          defaultValue={current.resultComment ?? ''}
          placeholder="Оценка, замечания"
        />
      </div>

      <div>
        <label className={labelClass} htmlFor={`reason-${athleteId}`}>
          Причина исправления
        </label>
        <input
          className={fieldClass}
          id={`reason-${athleteId}`}
          name="reason"
          placeholder="Нужна, если итог уже был сохранён"
        />
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-green-700">{state.success}</p> : null}

      <button className={primaryButtonClass} type="submit" disabled={pending}>
        {pending ? 'Сохраняем…' : 'Сохранить итог'}
      </button>
    </form>
  );
}

/** Кнопка действия со статусом: используется для переходов мероприятия. */
export function TransitionButton({
  action,
  label,
  pendingLabel,
  variant = 'primary',
}: {
  action: () => Promise<AttestationFormState>;
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary';
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: AttestationFormState) => action(),
    initial,
  );

  return (
    <form action={formAction} className="inline">
      <button
        className={variant === 'primary' ? primaryButtonClass : secondaryButtonClass}
        type="submit"
        disabled={pending}
      >
        {pending ? pendingLabel : label}
      </button>
      {state.error ? <p className="mt-1 text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
