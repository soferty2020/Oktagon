'use client';

import { useActionState, useEffect, useState } from 'react';

import { createInviteAction, type InviteFormState } from '@/app/users/invites/actions';
import { statusLabel } from '@/components/status-badge';

const initialState: InviteFormState = {};

const inputClass =
  'rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent';
const labelClass = 'flex flex-col gap-1 text-xs font-medium text-muted';
const buttonClass =
  'rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60';

/**
 * Приглашение пользователя.
 *
 * Саморегистрации в MVP нет: аккаунт создается приглашением. Провайдер доставки
 * письма не выбран (docs/25-open-questions.md), поэтому интерфейс не делает вид,
 * что письмо ушло: он показывает ссылку и говорит, что передать ее нужно вручную.
 *
 * Ссылка показывается только в ответе на создание: в базе хранится хеш токена, и
 * получить его повторно нельзя. Поэтому после перезагрузки страницы ссылки уже
 * не будет, и об этом сказано прямо.
 */
export function InviteForm() {
  const [state, formAction, pending] = useActionState(createInviteAction, initialState);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const inviteLink = state.token === undefined ? null : `${origin}/invite/${state.token}`;

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-white p-5">
      <div>
        <h2 className="text-sm font-semibold text-ink">Пригласить пользователя</h2>
        <p className="mt-1 text-xs text-muted">
          Письмо не отправляется: после создания появится ссылка, которую нужно передать
          приглашенному.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <label className={labelClass}>
          Электронная почта
          <input type="email" name="email" required maxLength={254} className={inputClass} />
        </label>

        <label className={labelClass}>
          Роль
          <select name="role" required defaultValue="STAFF" className={inputClass}>
            <option value="MEMBER">Участник — родитель или взрослый спортсмен</option>
            <option value="STAFF">Сотрудник — тренер или администратор</option>
            <option value="SUPERADMIN">Руководитель клуба</option>
          </select>
        </label>

        {state.error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {state.error}
          </p>
        ) : null}

        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? 'Создание…' : 'Создать приглашение'}
        </button>
      </form>

      {inviteLink ? (
        <div className="rounded-card border border-emerald-200 bg-emerald-50/60 p-3">
          <p className="text-xs font-medium text-emerald-900">
            Приглашение для {state.email} ({statusLabel(state.role ?? '')}) создано
          </p>
          <p className="mt-2 text-xs text-muted">
            Ссылка показывается один раз: в базе хранится только хеш токена. Передайте ее
            приглашенному — он задаст пароль и войдет.
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={inviteLink}
              aria-label="Ссылка приглашения"
              className="min-w-0 flex-1 rounded-md border border-line bg-white px-2 py-1 text-xs text-ink"
            />
            <CopyLinkButton link={inviteLink} />
          </div>

          <p className="mt-2 text-xs text-muted">
            {state.expiresAt ? `Действует до ${formatExpiry(state.expiresAt)}. ` : ''}
            Если ссылка потеряна, создайте приглашение заново: предыдущее будет погашено.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Копирование ссылки: администратор передает ее вручную, в мессенджере или письмом. */
function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
        } catch {
          // Буфер обмена может быть недоступен (нет разрешения, http вместо https):
          // ссылку видно в поле рядом, ее можно скопировать вручную.
          setCopied(false);
        }
      }}
      className="rounded-md border border-line bg-white px-3 py-1 text-xs text-ink hover:bg-canvas"
    >
      {copied ? 'Скопировано' : 'Копировать'}
    </button>
  );
}

/**
 * Момент UTC в виде «01.04.2026 18:00».
 *
 * Срок приглашения настраивается (`INVITE_TTL_HOURS`), поэтому подставлять
 * «трое суток» текстом нельзя: администратор увидит фактическую дату.
 */
function formatExpiry(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
