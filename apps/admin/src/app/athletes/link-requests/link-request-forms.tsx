'use client';

import { useActionState } from 'react';

import {
  approveLinkRequestAction,
  rejectLinkRequestAction,
  type LinkRequestActionState,
} from './actions';

const initialState: LinkRequestActionState = {};

/** Подпись под useActionState: (state, formData) → state. */
async function approveAction(_prev: LinkRequestActionState, formData: FormData) {
  return approveLinkRequestAction(formData);
}

async function rejectAction(_prev: LinkRequestActionState, formData: FormData) {
  return rejectLinkRequestAction(formData);
}

/**
 * Формы решения по заявке (ADR-0015).
 *
 * Клиентские, потому что `useActionState` показывает ошибку рядом с кнопкой:
 * серверный action, возвращающий значение, нельзя повесить на `<form>` напрямую.
 */
export function ApproveForm({
  requestId,
  athleteId,
  label = 'Подтвердить',
}: {
  requestId: string;
  athleteId: string;
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(approveAction, initialState);

  return (
    <form action={formAction}>
      <input name="requestId" type="hidden" value={requestId} />
      <input name="athleteId" type="hidden" value={athleteId} />
      <button
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Подтверждаем…' : label}
      </button>
      {state.error ? <p className="mt-2 text-xs text-red-700">{state.error}</p> : null}
      {state.success ? <p className="mt-2 text-xs text-emerald-700">{state.success}</p> : null}
    </form>
  );
}

export function RejectForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(rejectAction, initialState);

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <input name="requestId" type="hidden" value={requestId} />
      <textarea
        className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
        defaultValue=""
        name="reason"
        placeholder="Например: не совпадает дата рождения"
        required
        rows={3}
      />
      <button
        className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Отклоняем…' : 'Отклонить заявку'}
      </button>
      {state.error ? <p className="text-xs text-red-700">{state.error}</p> : null}
      {state.success ? <p className="text-xs text-emerald-700">{state.success}</p> : null}
    </form>
  );
}
