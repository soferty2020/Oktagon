'use client';

import { useActionState } from 'react';

import {
  archiveTrainerAction,
  createTrainerAction,
  linkTrainerAccountAction,
  unlinkTrainerAccountAction,
  updateTrainerAction,
  type TrainerFormState,
} from '@/app/trainers/actions';

const initialState: TrainerFormState = {};

const inputClass =
  'w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent';
const labelClass = 'flex flex-col gap-1 text-xs font-medium text-muted';
const buttonClass =
  'rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60';
const secondaryButtonClass =
  'rounded-md border border-line bg-white px-3 py-1.5 text-xs text-ink hover:bg-canvas disabled:opacity-60';

function StateMessages({ state }: { state: TrainerFormState }) {
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

/** Создание профиля тренера: аккаунт привязывается отдельно. */
export function CreateTrainerForm() {
  const [state, formAction, pending] = useActionState(createTrainerAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-card border border-line bg-white p-5"
    >
      <div>
        <h2 className="text-sm font-semibold text-ink">Новый тренер</h2>
        <p className="mt-1 text-xs text-muted">
          Профиль можно завести без аккаунта: вход в систему нужен не всем тренерам. Аккаунт
          привязывается отдельно и дает доступ к чатам групп и занятиям.
        </p>
      </div>

      <label className={labelClass}>
        Имя
        <input name="displayName" required maxLength={200} className={inputClass} />
      </label>

      <label className={labelClass}>
        Телефон
        <input name="phone" maxLength={32} className={inputClass} />
      </label>

      <label className={labelClass}>
        О тренере
        <textarea name="bio" rows={2} maxLength={2000} className={inputClass} />
      </label>

      <StateMessages state={state} />

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? 'Сохранение…' : 'Добавить тренера'}
      </button>
    </form>
  );
}

/** Правка карточки: имя, контакты, активность. */
export function EditTrainerForm({
  trainer,
}: {
  trainer: {
    id: string;
    displayName: string;
    phone: string | null;
    bio: string | null;
    isActive: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState(updateTrainerAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="trainerId" value={trainer.id} />

      <label className={labelClass}>
        Имя
        <input
          name="displayName"
          required
          maxLength={200}
          defaultValue={trainer.displayName}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Телефон
        <input
          name="phone"
          maxLength={32}
          defaultValue={trainer.phone ?? ''}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        О тренере
        <textarea
          name="bio"
          rows={2}
          maxLength={2000}
          defaultValue={trainer.bio ?? ''}
          className={inputClass}
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="isActive" defaultChecked={trainer.isActive} />
        активен (неактивный тренер не предлагается в расписании)
      </label>

      <StateMessages state={state} />

      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending ? 'Сохранение…' : 'Сохранить карточку'}
      </button>
    </form>
  );
}

/**
 * Привязка аккаунта к профилю.
 *
 * Требует права `users.manage`: связь дает человеку доступ в систему. Список
 * показывает только подходящие аккаунты (STAFF и SUPERADMIN), но окончательно
 * решает backend — роль и статус проверяются там.
 */
export function LinkAccountForm({
  trainerId,
  accounts,
}: {
  trainerId: string;
  accounts: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(linkTrainerAccountAction, initialState);

  if (accounts.length === 0) {
    return (
      <p className="text-xs text-muted">
        Нет свободных аккаунтов сотрудников. Пригласите пользователя с ролью STAFF — тогда его можно
        будет привязать.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="trainerId" value={trainerId} />

      <label className={labelClass}>
        Аккаунт сотрудника
        <select name="userId" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            выберите аккаунт
          </option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label}
            </option>
          ))}
        </select>
      </label>

      <StateMessages state={state} />

      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending ? 'Привязка…' : 'Привязать аккаунт'}
      </button>
    </form>
  );
}

/** Снятие связи: профиль и история занятий сохраняются. */
export function UnlinkAccountForm({ trainerId }: { trainerId: string }) {
  return (
    <form
      action={unlinkTrainerAccountAction}
      onSubmit={(event) => {
        if (
          !confirm(
            'Снять связь с аккаунтом? Тренер перестанет входить в систему и выпадет из чатов групп, но останется в расписании и истории занятий.',
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="trainerId" value={trainerId} />
      <button type="submit" className="text-xs text-muted underline hover:text-red-700">
        Снять связь
      </button>
    </form>
  );
}

/** Архивирование: профиль остается в проведенных занятиях. */
export function ArchiveTrainerForm({ trainerId }: { trainerId: string }) {
  return (
    <form
      action={archiveTrainerAction}
      onSubmit={(event) => {
        if (
          !confirm(
            'Архивировать тренера? Он исчезнет из списков и расписания, но останется в истории занятий.',
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="trainerId" value={trainerId} />
      <button type="submit" className="text-xs text-muted underline hover:text-red-700">
        Архивировать
      </button>
    </form>
  );
}
