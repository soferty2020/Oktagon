'use client';

import { useActionState } from 'react';

import { loginAction, type LoginState } from '@/app/actions';

const initialState: LoginState = {};

/** Форма входа. Состояние приходит из server action. */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-ink">Электронная почта</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="username"
          className="rounded-md border border-line px-3 py-2 text-ink outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-ink">Пароль</span>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="current-password"
          className="rounded-md border border-line px-3 py-2 text-ink outline-none focus:border-accent"
        />
      </label>

      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Вход…' : 'Войти'}
      </button>
    </form>
  );
}
