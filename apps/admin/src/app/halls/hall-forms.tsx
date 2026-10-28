'use client';

import { useActionState } from 'react';

import { archiveHallAction, createHallAction, updateHallAction, type HallFormState } from './actions';

const initialState: HallFormState = {};

const inputClass =
  'mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none';
const labelClass = 'block text-xs text-muted';

/** Подпись под `useActionState`: (state, formData) → state. */
async function createAction(_prev: HallFormState, formData: FormData) {
  return createHallAction(_prev, formData);
}

async function updateAction(_prev: HallFormState, formData: FormData) {
  return updateHallAction(_prev, formData);
}

async function archiveAction(_prev: HallFormState, formData: FormData) {
  return archiveHallAction(_prev, formData);
}

/** Создание зала: название, адрес, телефон, вместимость. */
export function CreateHallForm() {
  const [state, formAction, pending] = useActionState(createAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <label className={labelClass}>
        Название
        <input className={inputClass} name="name" placeholder="Центральный зал" required />
      </label>
      <label className={labelClass}>
        Адрес
        <input className={inputClass} name="address" placeholder="ул. Абая, 1" />
      </label>
      <label className={labelClass}>
        Телефон
        <input className={inputClass} name="phone" placeholder="+7 700 000 00 00" />
      </label>
      <label className={labelClass}>
        Вместимость
        <input className={inputClass} min={1} name="capacity" type="number" />
      </label>

      <button
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Создаём…' : 'Создать зал'}
      </button>

      {state.error ? <p className="text-xs text-red-700">{state.error}</p> : null}
      {state.success ? <p className="text-xs text-emerald-700">{state.success}</p> : null}
    </form>
  );
}

/** Редактирование и архивирование зала. */
export function HallCard({
  hall,
  groups,
  canManage,
}: {
  hall: { id: string; name: string; address: string | null; phone: string | null; capacity: number | null };
  groups: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [updateState, updateFormAction, updatePending] = useActionState(updateAction, initialState);
  const [archiveState, archiveFormAction, archivePending] = useActionState(
    archiveAction,
    initialState,
  );

  return (
    <section className="rounded-card border border-line bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{hall.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {hall.address ?? 'Адрес не указан'}
            {hall.phone ? `, ${hall.phone}` : ''}
            {hall.capacity ? `, до ${hall.capacity} человек` : ''}
          </p>
        </div>
        <span className="rounded-full bg-canvas px-3 py-1 text-xs text-muted">
          групп: {groups.length}
        </span>
      </div>

      {groups.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {groups.map((group) => (
            <a
              className="rounded-full border border-line px-3 py-1 text-xs text-ink hover:bg-canvas"
              href={`/groups/${group.id}`}
              key={group.id}
            >
              {group.name}
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">
          Групп пока нет. Создайте группу — она появится здесь.
        </p>
      )}

      {canManage ? (
        <details className="mt-4 border-t border-line pt-4">
          <summary className="cursor-pointer text-sm text-accent-text">Изменить зал</summary>

          <form action={updateFormAction} className="mt-3 space-y-3">
            <input name="hallId" type="hidden" value={hall.id} />
            <label className={labelClass}>
              Название
              <input className={inputClass} defaultValue={hall.name} name="name" />
            </label>
            <label className={labelClass}>
              Адрес
              <input className={inputClass} defaultValue={hall.address ?? ''} name="address" />
            </label>
            <label className={labelClass}>
              Телефон
              <input className={inputClass} defaultValue={hall.phone ?? ''} name="phone" />
            </label>
            <label className={labelClass}>
              Вместимость
              <input
                className={inputClass}
                defaultValue={hall.capacity ?? ''}
                min={1}
                name="capacity"
                type="number"
              />
            </label>

            <button
              className="rounded-lg border border-line bg-white px-4 py-2 text-sm text-ink hover:bg-canvas disabled:opacity-60"
              disabled={updatePending}
              type="submit"
            >
              {updatePending ? 'Сохраняем…' : 'Сохранить'}
            </button>

            {updateState.error ? (
              <p className="text-xs text-red-700">{updateState.error}</p>
            ) : null}
            {updateState.success ? (
              <p className="text-xs text-emerald-700">{updateState.success}</p>
            ) : null}
          </form>

          <form action={archiveFormAction} className="mt-4">
            <input name="hallId" type="hidden" value={hall.id} />
            <button
              className="rounded-lg border border-red-200 bg-white px-4 py-2 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
              disabled={archivePending}
              type="submit"
            >
              {archivePending ? 'Архивируем…' : 'Архивировать зал'}
            </button>
            {archiveState.error ? (
              <p className="mt-2 text-xs text-red-700">{archiveState.error}</p>
            ) : null}
          </form>
        </details>
      ) : null}
    </section>
  );
}
