'use client';

import { fieldClass } from '@/components/ui';

import { useActionState } from 'react';

import {
  archiveBranchAction,
  archiveHallAction,
  createHallAction,
  updateHallAction,
  type FormState,
} from '@/app/branches/actions';

const initialState: FormState = {};

const inputClass = fieldClass;
const labelClass = 'flex flex-col gap-1 text-xs font-medium text-muted';
const secondaryButtonClass =
  'rounded-md border border-line bg-white px-3 py-1.5 text-xs text-ink hover:bg-canvas disabled:opacity-60';

function StateMessages({ state }: { state: FormState }) {
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

/**
 * Архивирование филиала.
 *
 * Клиентский компонент, потому что подтверждение — событие браузера, а серверный
 * компонент обработчики событий не принимает: страница падала бы при рендере.
 */
export function ArchiveBranchForm({
  branchId,
  branchName,
}: {
  branchId: string;
  branchName: string;
}) {
  return (
    <form
      action={archiveBranchAction}
      onSubmit={(event) => {
        if (
          !confirm(
            `Архивировать филиал «${branchName}»? Он исчезнет из выбора при создании групп и занятий.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="branchId" value={branchId} />
      <button type="submit" className="text-xs text-muted underline hover:text-red-700">
        Архивировать
      </button>
    </form>
  );
}

/** Добавление зала в филиал. */
export function CreateHallForm({ branchId }: { branchId: string }) {
  const [state, formAction, pending] = useActionState(createHallAction, initialState);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
      <input type="hidden" name="branchId" value={branchId} />

      <div className="flex flex-wrap items-end gap-2">
        <label className={`${labelClass} min-w-40 flex-1`}>
          Название зала
          <input name="name" required maxLength={200} className={inputClass} />
        </label>
        <label className={`${labelClass} w-28`}>
          Вместимость
          <input name="capacity" type="number" min={1} max={1000} className={inputClass} />
        </label>
        <button type="submit" disabled={pending} className={secondaryButtonClass}>
          {pending ? 'Добавление…' : 'Добавить зал'}
        </button>
      </div>

      <StateMessages state={state} />
    </form>
  );
}

/**
 * Правка зала, включая перенос в другой филиал.
 *
 * Филиал в форме обязателен: перенос — это и есть исправление ошибки при
 * заведении. Backend проверит, что филиал активен и что название не занято в нем.
 */
export function EditHallForm({
  hall,
  branches,
}: {
  hall: { id: string; branchId: string; name: string; capacity: number | null; isActive: boolean };
  branches: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(updateHallAction, initialState);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="hallId" value={hall.id} />

      <div className="flex flex-wrap items-end gap-2">
        <label className={`${labelClass} min-w-40 flex-1`}>
          Название
          <input
            name="name"
            required
            maxLength={200}
            defaultValue={hall.name}
            className={inputClass}
          />
        </label>
        <label className={`${labelClass} w-28`}>
          Вместимость
          <input
            name="capacity"
            type="number"
            min={1}
            max={1000}
            defaultValue={hall.capacity ?? ''}
            className={inputClass}
          />
        </label>
        <label className={`${labelClass} min-w-40`}>
          Филиал
          <select name="branchId" defaultValue={hall.branchId} className={inputClass}>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="isActive" defaultChecked={hall.isActive} />
        активен (неактивный зал не предлагается в расписании)
      </label>

      <StateMessages state={state} />

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={secondaryButtonClass}>
          {pending ? 'Сохранение…' : 'Сохранить зал'}
        </button>
      </div>
    </form>
  );
}

/**
 * Архивирование зала.
 *
 * Отдельная форма, а не кнопка внутри формы правки: вложенные отправки смешали бы
 * состояния двух действий, а последствие у архивирования другое — зал исчезает
 * из выбора в расписании. Если в зале есть предстоящие занятия, backend откажет,
 * и причина будет видна текстом ошибки.
 */
export function ArchiveHallForm({ hallId, hallName }: { hallId: string; hallName: string }) {
  return (
    <form
      action={archiveHallAction}
      onSubmit={(event) => {
        if (
          !confirm(
            `Архивировать зал «${hallName}»? Он исчезнет из выбора в расписании. Если в нем есть предстоящие занятия, сначала перенесите их.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="hallId" value={hallId} />
      <button type="submit" className="text-xs text-muted underline hover:text-red-700">
        Архивировать зал
      </button>
    </form>
  );
}

/**
 * Одна строка зала со свёрнутой формой правки.
 *
 * `details` вместо отдельной страницы: залов немного, и администратору удобнее
 * видеть весь филиал целиком, чем переходить между экранами.
 */
export function HallRow({
  hall,
  branches,
}: {
  hall: { id: string; branchId: string; name: string; capacity: number | null; isActive: boolean };
  branches: { id: string; name: string }[];
}) {
  return (
    <details className="rounded-md border border-line bg-canvas px-3 py-2">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm text-ink">
        <span className="font-medium">{hall.name}</span>
        {hall.capacity ? (
          <span className="text-xs text-muted">до {hall.capacity} чел.</span>
        ) : null}
        {!hall.isActive ? (
          <span className="rounded-full bg-line px-2 py-0.5 text-xs text-muted">
            неактивен
          </span>
        ) : null}
        <span className="ml-auto text-xs text-muted">изменить</span>
      </summary>

      <div className="mt-1 flex flex-col gap-3">
        <EditHallForm hall={hall} branches={branches} />
        <ArchiveHallForm hallId={hall.id} hallName={hall.name} />
      </div>
    </details>
  );
}
