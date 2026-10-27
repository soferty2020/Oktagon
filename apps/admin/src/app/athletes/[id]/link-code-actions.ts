'use server';

import { apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface LinkCodeState {
  code?: string;
  expiresAt?: string;
  error?: string;
}

/**
 * Выдаёт код привязки родителя (ADR-0015).
 *
 * Код показывается один раз: в базе хранится только хеш. Повторный запрос
 * создаёт новый код и гасит предыдущий — так потерянный код не остаётся
 * действующим вечно.
 */
export async function issueLinkCodeAction(
  _prev: LinkCodeState,
  formData: FormData,
): Promise<LinkCodeState> {
  const athleteId = String(formData.get('athleteId') ?? '');

  if (!athleteId) {
    return { error: 'Не указан спортсмен' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Сессия истекла, войдите заново' };
  }

  const { accessToken } = await readTokens();
  if (!accessToken) {
    return { error: 'Сессия истекла, войдите заново' };
  }

  const result: { ok: true; data: { code: string; expiresAt: string } } | { ok: false; error: ApiFailure } =
    await apiFetch(`/athletes/${athleteId}/link-code`, {
      accessToken,
      method: 'POST',
    });

  if (!result.ok) {
    return { error: result.error.message || 'Не удалось выдать код' };
  }

  return { code: result.data.code, expiresAt: result.data.expiresAt };
}
