'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface RequestFormState {
  error?: string;
  success?: string;
}

async function withSession<T>(
  action: (
    accessToken: string,
  ) => Promise<{ ok: true; data: T } | { ok: false; error: ApiFailure }>,
  successMessage?: string,
): Promise<{ error?: string; success?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Сессия истекла, войдите заново' };
  }

  const { accessToken } = await readTokens();
  if (!accessToken) {
    return { error: 'Сессия истекла, войдите заново' };
  }

  const result = await action(accessToken);
  if (!result.ok) {
    return { error: result.error.message };
  }

  return { success: successMessage };
}

/** Смена статуса заявки (ADR-0013). */
export async function updateRequestStatusAction(
  id: string,
  status: string,
): Promise<RequestFormState> {
  const result = await withSession(
    (accessToken) =>
      apiFetch(`/api/v1/trial-requests/${id}`, {
        accessToken,
        method: 'PATCH',
        body: { status },
      }),
    'Статус обновлён',
  );

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath('/trial-requests');
  return { success: result.success };
}
