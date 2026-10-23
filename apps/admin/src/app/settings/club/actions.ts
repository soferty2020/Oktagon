'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, describeError, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface ClubProfileFormState {
  error?: string;
  success?: string;
}

/**
 * Сохранение профиля клуба (K1).
 *
 * Права проверяет backend: `PATCH /settings/club` закрыт SuperadminGuard по роли.
 * Здесь достаточно передать токен и показать ошибку — скрывать кнопку в
 * интерфейсе защитой не является (docs/13-architecture.md).
 */
export async function updateClubProfileAction(
  _prev: ClubProfileFormState,
  formData: FormData,
): Promise<ClubProfileFormState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Сессия истекла, войдите заново' };
  }

  const { accessToken } = await readTokens();
  if (!accessToken) {
    return { error: 'Сессия истекла, войдите заново' };
  }

  // Пустая строка означает «очистить поле»: форма не различает null и пустоту,
  // и отправлять null из input невозможно.
  const text = (name: string): string | null => {
    const value = formData.get(name);
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  const result = await apiFetch<unknown>('/settings/club', {
    method: 'PATCH',
    accessToken,
    body: {
      name: text('name') ?? '',
      logoUrl: text('logoUrl'),
      phone: text('phone'),
      email: text('email'),
      address: text('address'),
      timezone: text('timezone') ?? '',
    },
  });

  if (!result.ok) {
    return { error: describeError(result.error as ApiFailure) };
  }

  // Перерисовка нужна: поля неконтролируемые, и без нее в форме остались бы
  // старые значения, хотя в базе уже новые.
  revalidatePath('/settings/club');
  return { success: 'Профиль клуба сохранен' };
}
