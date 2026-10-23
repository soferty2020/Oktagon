'use client';

import { useActionState } from 'react';

import { updateClubProfileAction, type ClubProfileFormState } from './actions';

const initialState: ClubProfileFormState = {};

/** Профиль клуба, пришедший из API. */
export interface ClubProfileFormValues {
  name: string;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  timezone: string;
}

/**
 * Форма профиля клуба (K1).
 *
 * Часовой пояс — текстовое поле с подсказкой, а не выпадающий список: список зон
 * зависит от версии ICU на сервере, и жёсткий перечень в интерфейсе разошелся бы
 * с тем, что принимает API. Неверное значение сервер отклонит с объяснением.
 */
export function ClubProfileForm({ profile }: { profile: ClubProfileFormValues }) {
  const [state, formAction, pending] = useActionState(updateClubProfileAction, initialState);

  return (
    <form
      action={formAction}
      className="flex max-w-2xl flex-col gap-4 rounded-card border border-line bg-white p-5"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Название клуба</span>
        <input
          name="name"
          required
          maxLength={200}
          defaultValue={profile.name}
          className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Ссылка на логотип</span>
        <input
          name="logoUrl"
          type="url"
          maxLength={500}
          defaultValue={profile.logoUrl ?? ''}
          placeholder="https://cdn.octagon.kz/logo.png"
          className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <span className="text-[11px] text-muted">
          Абсолютная ссылка. Загрузки файлов в MVP нет.
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Телефон</span>
          <input
            name="phone"
            maxLength={32}
            defaultValue={profile.phone ?? ''}
            className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Email</span>
          <input
            name="email"
            type="email"
            maxLength={200}
            defaultValue={profile.email ?? ''}
            className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Адрес</span>
        <input
          name="address"
          maxLength={500}
          defaultValue={profile.address ?? ''}
          className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Часовой пояс</span>
        <input
          name="timezone"
          required
          maxLength={64}
          defaultValue={profile.timezone}
          placeholder="Asia/Almaty"
          className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <span className="text-[11px] text-muted">
          IANA-имя, например Asia/Almaty. Смещение вроде +05:00 не принимается: в нём
          не выразить переход на летнее время.
        </span>
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
        className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Сохранение…' : 'Сохранить'}
      </button>
    </form>
  );
}
