'use client';

import { useActionState } from 'react';
import { RANKS } from '@octagon/contracts';

import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/components/ui';
import {
  createCategoryAction,
  toggleCategoryAction,
  updateCategoryAction,
  type CategoryFormState,
} from './actions';

const initial: CategoryFormState = {};

/** Создание категории: общая или турнирная. */
export function CreateCategoryForm({
  competitions,
  defaultCompetitionId,
}: {
  competitions: { id: string; title: string }[];
  defaultCompetitionId?: string;
}) {
  const [state, formAction, pending] = useActionState(createCategoryAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="discipline">
            Дисциплина
          </label>
          <select className={fieldClass} defaultValue="KUMITE" id="discipline" name="discipline">
            <option value="KUMITE">Кумитэ</option>
            <option value="KATA">Ката</option>
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="name">
            Название
          </label>
          <input
            className={fieldClass}
            id="name"
            name="name"
            placeholder="Юноши 12–13 лет, до 45 кг"
            required
            minLength={2}
          />
          {state.fieldErrors?.name ? (
            <p className="mt-1 text-sm text-red-600">{state.fieldErrors.name}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <label className={labelClass} htmlFor="ageFrom">
            Возраст от
          </label>
          <input className={fieldClass} id="ageFrom" min={4} name="ageFrom" type="number" />
        </div>
        <div>
          <label className={labelClass} htmlFor="ageTo">
            Возраст до
          </label>
          <input className={fieldClass} id="ageTo" min={4} name="ageTo" type="number" />
        </div>
        <div>
          <label className={labelClass} htmlFor="weightFrom">
            Вес от, кг
          </label>
          <input className={fieldClass} id="weightFrom" name="weightFrom" step="0.1" type="number" />
        </div>
        <div>
          <label className={labelClass} htmlFor="weightTo">
            Вес до, кг
          </label>
          <input className={fieldClass} id="weightTo" name="weightTo" step="0.1" type="number" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="beltFrom">
            Ступень от
          </label>
          <select className={fieldClass} id="beltFrom" name="beltFrom">
            <option value="">Без ограничения</option>
            {RANKS.map((rank) => (
              <option key={rank.id} value={rank.id}>
                {rank.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="beltTo">
            Ступень до
          </label>
          <select className={fieldClass} id="beltTo" name="beltTo">
            <option value="">Без ограничения</option>
            {RANKS.map((rank) => (
              <option key={rank.id} value={rank.id}>
                {rank.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="competitionId">
          Турнир
        </label>
        <select
          className={fieldClass}
          defaultValue={defaultCompetitionId ?? ''}
          id="competitionId"
          name="competitionId"
        >
          <option value="">Общая категория клуба</option>
          {competitions.map((competition) => (
            <option key={competition.id} value={competition.id}>
              {competition.title}
            </option>
          ))}
        </select>
        <p className="mt-1 text-sm text-neutral-500">
          Турнирная категория останется только у этого турнира и не попадёт в общий справочник.
        </p>
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-green-700">{state.success}</p> : null}

      <button className={primaryButtonClass} type="submit" disabled={pending}>
        {pending ? 'Создаём…' : 'Создать категорию'}
      </button>
    </form>
  );
}

/** Переименование категории. */
export function RenameCategoryForm({ id, name }: { id: string; name: string }) {
  const [state, formAction, pending] = useActionState(
    updateCategoryAction.bind(null, id),
    initial,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className={labelClass} htmlFor={`name-${id}`}>
          Название
        </label>
        <input
          className={fieldClass}
          defaultValue={name}
          id={`name-${id}`}
          name="name"
          required
          minLength={2}
        />
      </div>
      <button className={secondaryButtonClass} type="submit" disabled={pending}>
        {pending ? 'Сохраняем…' : 'Сохранить'}
      </button>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-green-700">{state.success}</p> : null}
    </form>
  );
}

/** Кнопка «снять с публикации» / «вернуть». */
export function ToggleCategoryButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [state, formAction, pending] = useActionState(
    async (_previous: CategoryFormState) => toggleCategoryAction(id, !isActive),
    initial,
  );

  return (
    <form action={formAction} className="inline">
      <button className={secondaryButtonClass} type="submit" disabled={pending}>
        {pending ? '…' : isActive ? 'Снять с публикации' : 'Вернуть'}
      </button>
      {state.error ? <p className="mt-1 text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
