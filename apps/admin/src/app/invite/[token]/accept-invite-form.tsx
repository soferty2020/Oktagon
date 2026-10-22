'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { acceptInviteAction, type AcceptInviteState } from '@/app/users/invites/actions';

const initialState: AcceptInviteState = {};

const inputClass =
  'rounded-md border border-line px-3 py-2 text-ink outline-none focus:border-accent';
const labelClass = 'flex flex-col gap-1';

/**
 * Принятие приглашения: приглашенный задает пароль и профиль.
 *
 * Email подставлен и не редактируется: приглашение выдано на конкретный адрес, и
 * backend отклонит несовпадение (`INVITE_EMAIL_MISMATCH`). Меняемое поле здесь
 * только создавало бы ложное ощущение, что адрес можно поменять.
 */
export function AcceptInviteForm({
  token,
  email,
  role,
}: {
  token: string;
  email: string;
  role: string;
}) {
  const [state, formAction, pending] = useActionState(acceptInviteAction, initialState);

  if (state.accepted) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Аккаунт {state.accepted.email} создан
          {state.accepted.role ? ` с ролью ${state.accepted.role}` : ''}. Теперь можно войти.
        </div>
        <Link
          href="/login"
          className="rounded-md bg-accent px-4 py-2 text-center text-sm font-medium text-white"
        >
          Перейти ко входу
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      {/*
        Email показан текстом, а не полем: приглашение выдано на конкретный адрес,
        и backend отклонит несовпадение. Редактируемое поле создавало бы ложное
        ощущение, что адрес можно поменять.
      */}
      <div className={labelClass}>
        <span className="text-sm font-medium text-ink">Email приглашения</span>
        <span className="rounded-md border border-line bg-canvas px-3 py-2 text-ink">
          {email}
        </span>
        <span className="text-xs text-muted">
          Приглашение выдано на этот адрес; изменить его нельзя.
        </span>
      </div>
      <input type="hidden" name="email" value={email} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          <span className="text-sm font-medium text-ink">Фамилия</span>
          <input name="lastName" required maxLength={100} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span className="text-sm font-medium text-ink">Имя</span>
          <input name="firstName" required maxLength={100} className={inputClass} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          <span className="text-sm font-medium text-ink">Отчество</span>
          <input name="middleName" maxLength={100} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span className="text-sm font-medium text-ink">Телефон</span>
          <input name="phone" maxLength={32} className={inputClass} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          <span className="text-sm font-medium text-ink">Пароль</span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className="text-sm font-medium text-ink">Пароль еще раз</span>
          <input
            type="password"
            name="passwordRepeat"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </label>
      </div>

      <p className="text-xs text-muted">
        Роль {role} выдана приглашением. Повышение прав — отдельно, в разделе «Пользователи».
      </p>

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
        {pending ? 'Создание аккаунта…' : 'Создать аккаунт'}
      </button>
    </form>
  );
}
