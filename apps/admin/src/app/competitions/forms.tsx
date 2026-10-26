'use client';

import { useActionState } from 'react';

import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/components/ui';
import {
  addCompetitionParticipantAction,
  addEntryAction,
  addMatchAction,
  createCompetitionAction,
  recordEntryResultAction,
  type CompetitionFormState,
} from './actions';

const initial: CompetitionFormState = {};

function localDate(offsetDays = 14): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Создание турнира. */
export function CreateCompetitionForm() {
  const [state, formAction, pending] = useActionState(createCompetitionAction, initial);

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
          placeholder="Кубок клуба"
          required
          minLength={3}
        />
        {state.fieldErrors?.title ? (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.title}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="startsAt">
            Дата начала
          </label>
          <input
            className={fieldClass}
            id="startsAt"
            name="startsAt"
            type="date"
            defaultValue={localDate()}
            required
          />
          {state.fieldErrors?.startsAt ? (
            <p className="mt-1 text-sm text-red-600">{state.fieldErrors.startsAt}</p>
          ) : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="endsAt">
            Дата окончания
          </label>
          <input className={fieldClass} id="endsAt" name="endsAt" type="date" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="location">
            Место
          </label>
          <input className={fieldClass} id="location" name="location" placeholder="Дворец спорта" />
        </div>
        <div>
          <label className={labelClass} htmlFor="level">
            Уровень
          </label>
          <select className={fieldClass} id="level" name="level" defaultValue="CLUB">
            <option value="CLUB">Клубный</option>
            <option value="CITY">Городской</option>
            <option value="REGIONAL">Региональный</option>
            <option value="NATIONAL">Всероссийский</option>
            <option value="INTERNATIONAL">Международный</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="organizer">
          Организатор
        </label>
        <input className={fieldClass} id="organizer" name="organizer" placeholder="Федерация" />
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-green-700">{state.success}</p> : null}

      <button className={primaryButtonClass} type="submit" disabled={pending}>
        {pending ? 'Создаём…' : 'Создать турнир'}
      </button>
    </form>
  );
}

/** Заявка спортсмена. */
export function AddCompetitionParticipantForm({
  competitionId,
  athletes,
}: {
  competitionId: string;
  athletes: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    addCompetitionParticipantAction.bind(null, competitionId),
    initial,
  );

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
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

      <button className={primaryButtonClass} type="submit" disabled={pending}>
        {pending ? 'Заявляем…' : 'Заявить'}
      </button>

      {state.error ? <p className="sm:col-span-2 text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}

/** Участие в дисциплине: категория фильтруется по дисциплине. */
export function AddEntryForm({
  competitionId,
  athleteId,
  categories,
}: {
  competitionId: string;
  athleteId: string;
  categories: { id: string; name: string; discipline: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    addEntryAction.bind(null, competitionId, athleteId),
    initial,
  );

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
      <div>
        <label className={labelClass} htmlFor={`discipline-${athleteId}`}>
          Дисциплина
        </label>
        <select
          className={fieldClass}
          defaultValue="KUMITE"
          id={`discipline-${athleteId}`}
          name="discipline"
        >
          <option value="KUMITE">Кумитэ</option>
          <option value="KATA">Ката</option>
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor={`category-${athleteId}`}>
          Категория
        </label>
        <select className={fieldClass} id={`category-${athleteId}`} name="categoryId" required>
          <option value="">Выберите</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.discipline === 'KATA' ? 'Ката' : 'Кумитэ'} · {category.name}
            </option>
          ))}
        </select>
        {state.fieldErrors?.categoryId ? (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.categoryId}</p>
        ) : null}
      </div>

      <button className={secondaryButtonClass} type="submit" disabled={pending}>
        {pending ? 'Добавляем…' : 'Добавить участие'}
      </button>

      {state.error ? <p className="sm:col-span-3 text-sm text-red-600">{state.error}</p> : null}
      {state.success ? <p className="sm:col-span-3 text-sm text-green-700">{state.success}</p> : null}
    </form>
  );
}

/** Итог участия. */
export function EntryResultForm({
  competitionId,
  athleteId,
  entryId,
  current,
  isKumite,
}: {
  competitionId: string;
  athleteId: string;
  entryId: string;
  current: { result: string; place: number | null; medal: string; comment: string | null };
  isKumite: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    recordEntryResultAction.bind(null, competitionId, athleteId, entryId),
    initial,
  );

  const [matchState, matchAction, matchPending] = useActionState(
    addMatchAction.bind(null, competitionId, athleteId, entryId),
    initial,
  );

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor={`result-${entryId}`}>
              Итог
            </label>
            <select
              className={fieldClass}
              defaultValue={current.result}
              id={`result-${entryId}`}
              name="result"
              required
            >
              <option value="PENDING">Не заполнен</option>
              <option value="PLACED">Призовое место</option>
              <option value="PARTICIPATED">Участвовал</option>
              <option value="ELIMINATED">Выбыл</option>
              <option value="DISQUALIFIED">Дисквалифицирован</option>
              <option value="NO_SHOW">Не явился</option>
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor={`place-${entryId}`}>
              Место
            </label>
            <input
              className={fieldClass}
              defaultValue={current.place ?? ''}
              id={`place-${entryId}`}
              min={1}
              name="place"
              type="number"
              placeholder="Только для призового"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor={`medal-${entryId}`}>
              Медаль
            </label>
            <select
              className={fieldClass}
              defaultValue={current.medal}
              id={`medal-${entryId}`}
              name="medal"
            >
              <option value="NONE">Без медали</option>
              <option value="GOLD">Золото</option>
              <option value="SILVER">Серебро</option>
              <option value="BRONZE">Бронза</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor={`comment-${entryId}`}>
              Комментарий
            </label>
            <input
              className={fieldClass}
              defaultValue={current.comment ?? ''}
              id={`comment-${entryId}`}
              name="comment"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={`reason-${entryId}`}>
              Причина исправления
            </label>
            <input
              className={fieldClass}
              id={`reason-${entryId}`}
              name="reason"
              placeholder="Для опубликованных результатов"
            />
          </div>
        </div>

        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-green-700">{state.success}</p> : null}

        <button className={primaryButtonClass} type="submit" disabled={pending}>
          {pending ? 'Сохраняем…' : 'Сохранить результат'}
        </button>
      </form>

      {isKumite ? (
        <form action={matchAction} className="space-y-3 border-t border-neutral-100 pt-3">
          <p className="text-sm font-medium text-neutral-700">Встреча кумитэ</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className={labelClass} htmlFor={`round-${entryId}`}>
                Раунд
              </label>
              <input
                className={fieldClass}
                defaultValue={1}
                id={`round-${entryId}`}
                min={1}
                name="round"
                type="number"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor={`opponent-${entryId}`}>
                Соперник
              </label>
              <input className={fieldClass} id={`opponent-${entryId}`} name="opponentName" />
            </div>
            <div>
              <label className={labelClass} htmlFor={`club-${entryId}`}>
                Клуб соперника
              </label>
              <input className={fieldClass} id={`club-${entryId}`} name="opponentClub" />
            </div>
            <div>
              <label className={labelClass} htmlFor={`match-result-${entryId}`}>
                Результат
              </label>
              <select
                className={fieldClass}
                defaultValue="WIN"
                id={`match-result-${entryId}`}
                name="result"
              >
                <option value="WIN">Победа</option>
                <option value="LOSS">Поражение</option>
              </select>
            </div>
          </div>

          {matchState.error ? <p className="text-sm text-red-600">{matchState.error}</p> : null}
          {matchState.success ? (
            <p className="text-sm text-green-700">{matchState.success}</p>
          ) : null}

          <button className={secondaryButtonClass} type="submit" disabled={matchPending}>
            {matchPending ? 'Добавляем…' : 'Добавить встречу'}
          </button>
        </form>
      ) : (
        <p className="border-t border-neutral-100 pt-3 text-sm text-neutral-500">
          Ката оценивается итоговым местом — встречи не ведутся.
        </p>
      )}
    </div>
  );
}

/** Кнопка перехода статуса. */
export function CompetitionActionButton({
  action,
  label,
  pendingLabel,
  variant = 'primary',
}: {
  action: () => Promise<CompetitionFormState>;
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary';
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: CompetitionFormState) => action(),
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
