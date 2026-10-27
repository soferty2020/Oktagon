'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface LinkRequestActionState {
  error?: string;
  success?: string;
}

async function withSession<T>(
  action: (
    accessToken: string,
  ) => Promise<{ ok: true; data: T } | { ok: false; error: ApiFailure }>,
  successMessage: string,
): Promise<LinkRequestActionState> {
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

  revalidatePath('/athletes/link-requests');
  return { success: successMessage };
}

/**
 * Подтверждение заявки: связывает родителя с выбранной карточкой.
 *
 * Администратор сам выбирает карточку из кандидатов: автоматическое
 * сопоставление по фамилии ошибалось бы на однофамильцах, а цена ошибки —
 * доступ к данным чужого ребёнка.
 */
export async function approveLinkRequestAction(
  formData: FormData,
): Promise<LinkRequestActionState> {
  const requestId = String(formData.get('requestId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '');

  if (!requestId || !athleteId) {
    return { error: 'Выберите карточку спортсмена' };
  }

  return withSession(
    (accessToken) =>
      apiFetch(`/link-requests/${requestId}/approve`, {
        accessToken,
        method: 'POST',
        body: { athleteId },
      }),
    'Заявка подтверждена, родитель получил доступ',
  );
}

/** Отклонение заявки: причина обязательна, родитель увидит её в приложении. */
export async function rejectLinkRequestAction(
  formData: FormData,
): Promise<LinkRequestActionState> {
  const requestId = String(formData.get('requestId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();

  if (!requestId) {
    return { error: 'Не указана заявка' };
  }

  if (reason.length < 3) {
    return { error: 'Укажите причину отказа' };
  }

  return withSession(
    (accessToken) =>
      apiFetch(`/link-requests/${requestId}/reject`, {
        accessToken,
        method: 'POST',
        body: { reason },
      }),
    'Заявка отклонена',
  );
}
