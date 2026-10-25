'use client';

import { useActionState } from 'react';

import { grantPermissionAction, type PermissionFormState } from '@/app/users/actions';

const initialState: PermissionFormState = {};

const inputClass =
  'rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent';
const labelClass = 'flex flex-col gap-1 text-xs font-medium text-muted';

/**
 * Выдача индивидуального права (B5).
 *
 * В списке только те права, которых у пользователя еще нет: повторная выдача
 * ничего не меняла бы, а право от роли backend все равно отклонит.
 */
export function GrantPermissionForm({
  userId,
  available,
  labels,
}: {
  userId: string;
  available: string[];
  labels: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(grantPermissionAction, initialState);

  if (available.length === 0) {
    return (
      <p className="text-xs text-muted">
        Все права каталога уже доступны пользователю через роль или выданы лично
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="userId" value={userId} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className={`${labelClass} flex-1`}>
          Право
          <select name="code" required className={inputClass} defaultValue="">
            <option value="" disabled>
              выберите право
            </option>
            {available.map((code) => (
              <option key={code} value={code}>
                {labels[code] ?? code}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Действует до
          <input type="date" name="expiresAt" className={inputClass} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? '…' : 'Выдать'}
        </button>
      </div>

      <p className="text-xs text-muted">
        Без срока право действует бессрочно.
      </p>

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
