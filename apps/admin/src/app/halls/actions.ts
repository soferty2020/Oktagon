'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface HallFormState {
  error?: string;
  success?: string;
}

async function withSession<T>(
  action: (
    accessToken: string,
  ) => Promise<{ ok: true; data: T } | { ok: false; error: ApiFailure }>,
  successMessage: string,
): Promise<HallFormState> {
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
    return { error: result.error.message || 'Не удалось выполнить действие' };
  }

  revalidatePath('/halls');
  return { success: successMessage };
}

function optionalText(formData: FormData, field: string): string | undefined {
  const value = String(formData.get(field) ?? '').trim();
  return value === '' ? undefined : value;
}

/** Создание зала (#64): адрес и телефон — свойства зала, филиала нет. */
export async function createHallAction(
  _prev: HallFormState,
  formData: FormData,
): Promise<HallFormState> {
  const name = String(formData.get('name') ?? '').trim();

  if (!name) {
    return { error: 'Укажите название зала' };
  }

  const capacity = optionalText(formData, 'capacity');

  return withSession(
    (accessToken) =>
      apiFetch('/halls', {
        accessToken,
        method: 'POST',
        body: {
          name,
          address: optionalText(formData, 'address') ?? null,
          phone: optionalText(formData, 'phone') ?? null,
          ...(capacity ? { capacity: Number(capacity) } : {}),
        },
      }),
    'Зал создан',
  );
}

export async function updateHallAction(
  _prev: HallFormState,
  formData: FormData,
): Promise<HallFormState> {
  const hallId = String(formData.get('hallId') ?? '');

  if (!hallId) {
    return { error: 'Не указан зал' };
  }

  const capacity = optionalText(formData, 'capacity');

  return withSession(
    (accessToken) =>
      apiFetch(`/halls/${hallId}`, {
        accessToken,
        method: 'PATCH',
        body: {
          ...(optionalText(formData, 'name') ? { name: optionalText(formData, 'name') } : {}),
          address: optionalText(formData, 'address') ?? null,
          phone: optionalText(formData, 'phone') ?? null,
          ...(capacity ? { capacity: Number(capacity) } : {}),
        },
      }),
    'Зал обновлён',
  );
}

/** Архивирование: зал с группами или занятиями API не закроет. */
export async function archiveHallAction(
  _prev: HallFormState,
  formData: FormData,
): Promise<HallFormState> {
  const hallId = String(formData.get('hallId') ?? '');

  if (!hallId) {
    return { error: 'Не указан зал' };
  }

  return withSession(
    (accessToken) =>
      apiFetch(`/halls/${hallId}`, {
        accessToken,
        method: 'DELETE',
      }),
    'Зал архивирован',
  );
}
