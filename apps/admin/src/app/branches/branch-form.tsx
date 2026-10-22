'use client';

import { useActionState } from 'react';

import { createBranchAction, type FormState } from '@/app/branches/actions';

const initialState: FormState = {};

/** Форма создания филиала (C1). */
export function BranchForm() {
  const [state, formAction, pending] = useActionState(createBranchAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-card border border-line bg-white p-5"
    >
      <h2 className="text-sm font-semibold text-ink">Новый филиал</h2>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Название</span>
        <input
          name="name"
          required
          maxLength={200}
          className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Адрес</span>
        <input
          name="address"
          maxLength={500}
          className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Телефон</span>
        <input
          name="phone"
          maxLength={32}
          className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

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

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Сохранение…' : 'Создать филиал'}
      </button>
    </form>
  );
}
