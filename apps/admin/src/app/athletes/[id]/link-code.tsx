'use client';

import { useActionState } from 'react';

import { Icon } from './icons';
import { issueLinkCodeAction, type LinkCodeState } from './link-code-actions';

const initialState: LinkCodeState = {};

/**
 * Код для родителя (ADR-0015).
 *
 * Показывается один раз: в базе только хеш. Выдать код может тренер группы или
 * администратор — право `athletes.edit` проверяет API, здесь только кнопка.
 */
export function LinkCodeCard({ athleteId }: { athleteId: string }) {
  const [state, formAction, pending] = useActionState(issueLinkCodeAction, initialState);

  const expires = state.expiresAt
    ? new Date(state.expiresAt).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null;

  return (
    <section className="rounded-card border border-line bg-white p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        <Icon className="h-4 w-4 text-muted" name="group" />
        Код для родителя
      </h2>
      <p className="mt-1 text-xs text-muted">
        Родитель введёт код в приложении — и увидит ребёнка. Код одноразовый.
      </p>

      {state.code ? (
        <div className="mt-4 rounded-lg bg-accent-soft p-4 text-center">
          <p className="font-mono text-2xl font-bold tracking-[0.2em] text-accent-text">
            {state.code}
          </p>
          <p className="mt-1 text-xs text-accent-text/80">
            Действует до {expires}. Передайте родителю — повторно код не показать.
          </p>
        </div>
      ) : null}

      {state.error ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}

      <form action={formAction} className="mt-4">
        <input name="athleteId" type="hidden" value={athleteId} />
        <button
          className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-canvas"
          disabled={pending}
          type="submit"
        >
          {pending ? 'Выдаём…' : state.code ? 'Выдать новый код' : 'Выдать код'}
        </button>
      </form>
    </section>
  );
}
