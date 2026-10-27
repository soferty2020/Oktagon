'use client';

import { fieldClass } from '@/components/ui';

import { useActionState } from 'react';

import { RANKS } from '@octagon/contracts';

import { statusLabel } from '@/components/status-badge';

import {
  createAthleteAction,
  linkAccountAction,
  updateAthleteAction,
  type AthleteFormState,
} from '@/app/athletes/actions';

const initialState: AthleteFormState = {};

const inputClass = fieldClass;
const labelClass = 'flex flex-col gap-1 text-xs font-medium text-muted';
const buttonClass =
  'rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60';

const STATUSES = ['ACTIVE', 'FROZEN', 'ARCHIVED'] as const;
const GENDERS = [['MALE', 'Мужской'], ['FEMALE', 'Женский'], ['UNSPECIFIED', 'Не указан']] as const;

function StateMessages({ state }: { state: AthleteFormState }) {
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
      {state.createdId ? (
        <p className="rounded-md bg-canvas px-3 py-2 text-xs text-muted">
          Карточка: <span className="font-mono">{state.createdId}</span>
        </p>
      ) : null}
    </>
  );
}

/**
 * Создание карточки спортсмена (C4).
 *
 * Поля контактов показываются всегда: их сохранение требует `athletes.edit`, а
 * показ — отдельного права `athletes.contacts.view`. Скрывать ввод из-за
 * второго права значило бы мешать администратору заводить данные.
 */
export function CreateAthleteForm() {
  const [state, formAction, pending] = useActionState(createAthleteAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-card border border-line bg-white p-5"
    >
      <h2 className="text-sm font-semibold text-ink">Новый спортсмен</h2>

      <label className={labelClass}>
        Фамилия
        <input
          name="lastName"
          required
          maxLength={100}
          aria-invalid={state.fieldErrors?.lastName ? true : undefined}
          aria-describedby={state.fieldErrors?.lastName ? 'lastName-error' : undefined}
          className={inputClass}
        />
        {state.fieldErrors?.lastName ? (
          <span id="lastName-error" className="text-xs text-danger">
            {state.fieldErrors.lastName}
          </span>
        ) : null}
      </label>
      <label className={labelClass}>
        Имя
        <input
          name="firstName"
          required
          maxLength={100}
          aria-invalid={state.fieldErrors?.firstName ? true : undefined}
          aria-describedby={state.fieldErrors?.firstName ? 'firstName-error' : undefined}
          className={inputClass}
        />
        {state.fieldErrors?.firstName ? (
          <span id="firstName-error" className="text-xs text-danger">
            {state.fieldErrors.firstName}
          </span>
        ) : null}
      </label>
      <label className={labelClass}>
        Отчество
        <input name="middleName" maxLength={100} className={inputClass} />
      </label>
      <label className={labelClass}>
        Дата рождения
        <input type="date" name="birthDate" className={inputClass} />
      </label>
      <label className={labelClass}>
        Пол
        <select name="gender" className={inputClass} defaultValue="">
          <option value="">не указан</option>
          {GENDERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Телефон
        <input name="phone" maxLength={32} className={inputClass} />
      </label>
      <label className={labelClass}>
        Электронная почта
        <input type="email" name="email" maxLength={254} className={inputClass} />
      </label>
      <label className={labelClass}>
        Заметки клуба
        <textarea name="notes" rows={2} maxLength={2000} className={inputClass} />
      </label>

      <StateMessages state={state} />

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? 'Сохранение…' : 'Создать карточку'}
      </button>
    </form>
  );
}

interface AthleteValues {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  birthDate: string | null;
  status: string;
  beltGrade: string;
  rank: string | null;
  beltAwardedAt: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

/** Изменение карточки: контакты, заметки и статус (BR-006). */
export function EditAthleteForm({ athlete }: { athlete: AthleteValues }) {
  const [state, formAction, pending] = useActionState(updateAthleteAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-card border border-line bg-white p-5"
    >
      <h2 className="text-sm font-semibold text-ink">Карточка</h2>
      <input type="hidden" name="athleteId" value={athlete.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Фамилия
          <input
            name="lastName"
            required
            maxLength={100}
            defaultValue={athlete.lastName}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Имя
          <input
            name="firstName"
            required
            maxLength={100}
            defaultValue={athlete.firstName}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Отчество
          <input
            name="middleName"
            maxLength={100}
            defaultValue={athlete.middleName ?? ''}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Дата рождения
          <input
            type="date"
            name="birthDate"
            defaultValue={athlete.birthDate ?? ''}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Телефон
          <input
            name="phone"
            maxLength={32}
            defaultValue={athlete.phone ?? ''}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Электронная почта
          <input
            type="email"
            name="email"
            maxLength={254}
            defaultValue={athlete.email ?? ''}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Статус
          <select name="status" defaultValue={athlete.status} className={inputClass}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Ступень
          {/* Ступень определяет пояс (ADR-0012): отдельный выбор пояса убран,
              иначе можно было сохранить «синий пояс, 10 кю».

              Пустое значение — «не определена», а не 0 кю. Раньше форма
              подставляла 0 кю, и сохранение любого другого поля затирало
              реальную ступень: пояс оставался оранжевым, а ступень становилась
              белой (#60). */}
          <select name="rank" defaultValue={athlete.rank ?? ''} className={inputClass}>
            <option value="">Не определена</option>
            {RANKS.map((rank) => (
              <option key={rank.id} value={rank.id}>
                {rank.label} — {rank.beltLabel}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-muted">
            Пояс определится из ступени. «Не определена» оставляет текущий пояс без изменений.
          </span>
        </label>
        <label className={labelClass}>
          Дата присвоения пояса
          <input
            type="date"
            name="beltAwardedAt"
            defaultValue={athlete.beltAwardedAt ?? ''}
            className={inputClass}
          />
        </label>
      </div>

      <label className={labelClass}>
        Заметки клуба
        <textarea
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={athlete.notes ?? ''}
          className={inputClass}
        />
      </label>

      <StateMessages state={state} />

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? 'Сохранение…' : 'Сохранить'}
      </button>
    </form>
  );
}

/** Связь аккаунта со спортсменом (C5). Один аккаунт может быть основным. */
export function LinkAccountForm({
  athleteId,
  users,
}: {
  athleteId: string;
  users: { id: string; email: string }[];
}) {
  const [state, formAction, pending] = useActionState(linkAccountAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="athleteId" value={athleteId} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className={`${labelClass} flex-1`}>
          Аккаунт
          <select name="userId" required className={inputClass} defaultValue="">
            <option value="" disabled>
              выберите аккаунт
            </option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Кем является
          <input name="relation" placeholder="например, родитель" maxLength={32} className={inputClass} />
        </label>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? '…' : 'Связать'}
        </button>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="isPrimary" />
        основной аккаунт
      </label>

      <StateMessages state={state} />
    </form>
  );
}
