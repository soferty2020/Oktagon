'use client';

import { useActionState } from 'react';

import { secondaryButtonClass } from '@/components/ui';
import { updateRequestStatusAction, type RequestFormState } from './actions';

const initial: RequestFormState = {};

/** Кнопка смены статуса заявки. */
export function StatusButton({
  id,
  status,
  label,
}: {
  id: string;
  status: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: RequestFormState) => updateRequestStatusAction(id, status),
    initial,
  );

  return (
    <form action={formAction} className="inline">
      <button className={secondaryButtonClass} type="submit" disabled={pending}>
        {pending ? '…' : label}
      </button>
      {state.error ? <p className="mt-1 text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
