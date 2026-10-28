'use client';

import { fieldClass } from '@/components/ui';

import { useActionState } from 'react';

import {
  addMemberAction,
  assignTrainerAction,
  createGroupAction,
  setGroupHallAction,
  type GroupFormState,
} from '@/app/groups/actions';

const initialState: GroupFormState = {};

const inputClass = fieldClass;
const labelClass = 'flex flex-col gap-1 text-xs font-medium text-muted';
const buttonClass =
  'rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60';

function StateMessages({ state }: { state: GroupFormState }) {
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

/** Создание группы с залом и необязательным тренером (C6–C7, #65). */
export function CreateGroupForm({
  halls,
  trainers,
}: {
  halls: { id: string; name: string }[];
  trainers: { id: string; displayName: string }[];
}) {
  const [state, formAction, pending] = useActionState(createGroupAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-card border border-line bg-white p-5"
    >
      <h2 className="text-sm font-semibold text-ink">Новая группа</h2>

      <label className={labelClass}>
        Название
        <input name="name" required maxLength={200} className={inputClass} />
      </label>

      <label className={labelClass}>
        Описание
        <textarea name="description" rows={2} maxLength={2000} className={inputClass} />
      </label>

      <label className={labelClass}>
        Зал
        <select name="hallId" className={inputClass} defaultValue="">
          <option value="">не назначать</option>
          {halls.map((hall) => (
            <option key={hall.id} value={hall.id}>
              {hall.name}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Основной тренер
        <select name="trainerId" className={inputClass} defaultValue="">
          <option value="">не назначать</option>
          {trainers.map((trainer) => (
            <option key={trainer.id} value={trainer.id}>
              {trainer.displayName}
            </option>
          ))}
        </select>
      </label>

      <StateMessages state={state} />

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? 'Сохранение…' : 'Создать группу'}
      </button>
    </form>
  );
}

/** Перенос группы в другой зал: зал у группы один (#65). */
export function SetGroupHallForm({
  groupId,
  halls,
}: {
  groupId: string;
  halls: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(setGroupHallAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <div className="flex items-end gap-2">
        <label className={`${labelClass} flex-1`}>
          Зал группы
          <select name="hallId" required className={inputClass} defaultValue="">
            <option value="" disabled>
              выберите зал
            </option>
            {halls.map((hall) => (
              <option key={hall.id} value={hall.id}>
                {hall.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? '…' : 'Перенести'}
        </button>
      </div>
      <StateMessages state={state} />
    </form>
  );
}

/** Назначение тренера на группу. */
export function AssignTrainerForm({
  groupId,
  trainers,
}: {
  groupId: string;
  trainers: { id: string; displayName: string }[];
}) {
  const [state, formAction, pending] = useActionState(assignTrainerAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <div className="flex items-end gap-2">
        <label className={`${labelClass} flex-1`}>
          Назначить тренера
          <select name="trainerId" required className={inputClass} defaultValue="">
            <option value="" disabled>
              выберите тренера
            </option>
            {trainers.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainer.displayName}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? '…' : 'Назначить'}
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="isPrimary" />
        сделать основным
      </label>
      <StateMessages state={state} />
    </form>
  );
}

/**
 * Добавление спортсмена в группу.
 *
 * Отдельного справочника спортсменов для выбора пока нет, поэтому поле
 * принимает идентификатор спортсмена: его видно в адресной строке карточки.
 * Когда появится карточка спортсмена, поле заменится поиском по ФИО.
 */
export function AddMemberForm({ groupId }: { groupId: string }) {
  const [state, formAction, pending] = useActionState(addMemberAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <div className="flex items-end gap-2">
        <label className={`${labelClass} flex-1`}>
          Добавить спортсмена (идентификатор)
          <input
            name="athleteId"
            required
            placeholder="00000000-0000-0000-0000-000000000000"
            className={inputClass}
          />
        </label>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? '…' : 'Добавить'}
        </button>
      </div>
      <label className={labelClass}>
        Дата вступления
        <input type="date" name="joinedAt" className={inputClass} />
      </label>
      <StateMessages state={state} />
    </form>
  );
}

/**
 * Привязка конкретного спортсмена к группе (#68).
 *
 * Открывается из карточки спортсмена по ссылке `/groups?assign=<id>`: человек уже
 * выбран, остаётся выбрать группу — иначе он попал бы в общий список групп без
 * понятного следующего шага.
 */
export function AssignAthleteForm({
  athlete,
  groups,
}: {
  athlete: { id: string; firstName: string; lastName: string };
  groups: { id: string; name: string; hallName: string | null }[];
}) {
  const [state, formAction, pending] = useActionState(addMemberAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-card border border-accent/30 bg-accent-soft/40 p-5"
    >
      <input type="hidden" name="athleteId" value={athlete.id} />

      <div>
        <h2 className="text-sm font-semibold text-ink">
          Привязать: {athlete.lastName} {athlete.firstName}
        </h2>
        <p className="mt-1 text-xs text-muted">
          Выберите группу — спортсмен сразу попадёт в её состав.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
        <label className={labelClass}>
          Группа
          <select name="groupId" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              выберите группу
            </option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
                {group.hallName ? ` — ${group.hallName}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Дата вступления
          <input type="date" name="joinedAt" className={inputClass} />
        </label>
      </div>

      <StateMessages state={state} />

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? 'Привязываем…' : 'Привязать к группе'}
        </button>
        <a className="text-xs text-muted underline hover:text-ink" href={`/athletes/${athlete.id}`}>
          Вернуться к карточке
        </a>
      </div>
    </form>
  );
}
