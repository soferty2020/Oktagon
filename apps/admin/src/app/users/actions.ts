'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface PermissionFormState {
  error?: string;
  success?: string;
}

/**
 * Server actions прав пользователя (B5).
 *
 * Индивидуальное право выдается поверх роли. Право, которое уже дает роль,
 * выдать лично нельзя: иначе его нельзя было бы отозвать, не сломав ожидания
 * роли (ADR-0006). Backend возвращает `PERMISSION_GRANTED_BY_ROLE`, и это
 * переводится в понятное сообщение.
 */
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
    return { error: describePermissionError(result.error) };
  }
  return successMessage ? { success: successMessage } : {};
}

function describePermissionError(error: ApiFailure): string {
  switch (error.code) {
    case 'PERMISSION_GRANTED_BY_ROLE':
      return 'Это право уже дает роль: выдавать его лично не нужно';
    case 'PERMISSION_IS_ROLE_BASED':
      return 'Право предоставлено ролью и не отзывается: измените роль пользователя';
    case 'PERMISSION_UNKNOWN':
      return 'Неизвестный код права';
    case 'PERMISSION_NOT_GRANTED':
      return 'Это право не выдавалось пользователю лично';
    case 'FORBIDDEN':
      return 'Недостаточно прав: нужно право «permissions.manage»';
    default:
      return error.message;
  }
}

export async function grantPermissionAction(
  _prev: PermissionFormState,
  formData: FormData,
): Promise<PermissionFormState> {
  const userId = String(formData.get('userId') ?? '');
  const code = String(formData.get('code') ?? '').trim();
  const expiresAtRaw = String(formData.get('expiresAt') ?? '').trim();

  if (!code) {
    return { error: 'Выберите право' };
  }

  // Дата из input[type=date] приходит без времени: для срока действия это конец
  // указанного дня в UTC, иначе доступ истек бы в его начале.
  const expiresAt = expiresAtRaw ? `${expiresAtRaw}T23:59:59.000Z` : undefined;

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/users/${userId}/permissions`, {
        accessToken,
        method: 'POST',
        body: { code, ...(expiresAt ? { expiresAt } : {}) },
      }),
    `Право «${code}» выдано`,
  );

  if (!state.error) {
    revalidatePath(`/users/${userId}/permissions`);
  }
  return state;
}

export async function revokePermissionAction(formData: FormData): Promise<void> {
  const userId = String(formData.get('userId') ?? '');
  const code = String(formData.get('code') ?? '');
  if (!userId || !code) {
    return;
  }

  await withSession((accessToken) =>
    apiFetch(`/users/${userId}/permissions/${encodeURIComponent(code)}`, {
      accessToken,
      method: 'DELETE',
    }),
  );

  revalidatePath(`/users/${userId}/permissions`);
}
