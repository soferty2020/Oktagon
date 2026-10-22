'use client';

import { useActionState } from 'react';

import {
  addMemberAction,
  assignTrainerAction,
  createGroupAction,
  linkBranchAction,
  type GroupFormState,
} from '@/app/groups/actions';

const initialState: GroupFormState = {};

const inputClass =
  'rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent';
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

/** Создание группы с необязательной привязкой филиала и тренера (C6–C7). */
export function CreateGroupForm({
  branches,
  trainers,
}: {
  branches: { id: string; name: string }[];
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
        Основной филиал
        <select name="branchId" className={inputClass} defaultValue="">
          <option value="">не назначать</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
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

/** Привязка филиала к существующей группе. */
export function LinkBranchForm({
  groupId,
  branches,
}: {
  groupId: string;
  branches: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(linkBranchAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <div className="flex items-end gap-2">
        <label className={`${labelClass} flex-1`}>
          Привязать филиал
          <select name="branchId" required className={inputClass} defaultValue="">
            <option value="" disabled>
              выберите филиал
            </option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? '…' : 'Привязать'}
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
