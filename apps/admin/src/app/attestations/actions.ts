'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface AttestationFormState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Server actions аттестаций (#40).
 *
 * Каждое действие — один вызов API и `revalidatePath`: после смены статуса или
 * результата список и карточка должны показать новое состояние, а не кэш.
 */
async function withSession<T>(
  action: (
    accessToken: string,
  ) => Promise<{ ok: true; data: T } | { ok: false; error: ApiFailure }>,
  successMessage?: string,
): Promise<{ error?: string; success?: string; data?: T }> {
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

  return { success: successMessage, data: result.data };
}

function stringField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** Создание мероприятия. */
export async function createEventAction(
  _previous: AttestationFormState,
  formData: FormData,
): Promise<AttestationFormState> {
  const title = stringField(formData, 'title');
  const scheduledAt = stringField(formData, 'scheduledAt');

  const fieldErrors: Record<string, string> = {};
  if (title.length < 3) {
    fieldErrors.title = 'Название короче трёх символов';
  }
  if (!scheduledAt) {
    fieldErrors.scheduledAt = 'Укажите дату и время';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, error: 'Проверьте выделенные поля' };
  }

  const result = await withSession(
    (accessToken) =>
      apiFetch('/certification-events', {
        accessToken,
        method: 'POST',
        body: {
          title,
          scheduledAt: new Date(scheduledAt).toISOString(),
          location: stringField(formData, 'location') || undefined,
          organizer: stringField(formData, 'organizer') || undefined,
          description: stringField(formData, 'description') || undefined,
        },
      }),
    'Мероприятие создано',
  );

  if (result.error) {
    return { error: result.error, fieldErrors };
  }

  revalidatePath('/attestations');
  return { success: result.success };
}

/** Смена статуса: планирование, начало, завершение, отмена. */
async function transition(id: string, action: string, success: string) {
  const result = await withSession(
    (accessToken) =>
      apiFetch(`/certification-events/${id}/${action}`, {
        accessToken,
        method: 'POST',
      }),
    success,
  );

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath('/attestations');
  revalidatePath(`/attestations/${id}`);
  return { success: result.success };
}

export async function planEventAction(id: string): Promise<AttestationFormState> {
  return transition(id, 'plan', 'Мероприятие запланировано');
}

export async function startEventAction(id: string): Promise<AttestationFormState> {
  return transition(id, 'start', 'Экзамен начался');
}

export async function completeEventAction(id: string): Promise<AttestationFormState> {
  return transition(id, 'complete', 'Мероприятие завершено');
}

export async function cancelEventAction(id: string): Promise<AttestationFormState> {
  return transition(id, 'cancel', 'Мероприятие отменено: результаты остались в архиве');
}

export async function publishEventAction(id: string): Promise<AttestationFormState> {
  const result = await withSession(
    (accessToken) =>
      apiFetch(`/certification-events/${id}/publish`, {
        accessToken,
        method: 'POST',
      }),
    'Результаты опубликованы',
  );

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath('/attestations');
  revalidatePath(`/attestations/${id}`);
  return { success: result.success };
}

/** Добавление участника. */
export async function addParticipantAction(
  eventId: string,
  _previous: AttestationFormState,
  formData: FormData,
): Promise<AttestationFormState> {
  const athleteId = stringField(formData, 'athleteId');
  const targetRank = stringField(formData, 'targetRank');

  const fieldErrors: Record<string, string> = {};
  if (!athleteId) {
    fieldErrors.athleteId = 'Выберите спортсмена';
  }
  if (!targetRank) {
    fieldErrors.targetRank = 'Выберите ступень';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, error: 'Проверьте выделенные поля' };
  }

  const result = await withSession(
    (accessToken) =>
      apiFetch(`/certification-events/${eventId}/participants`, {
        accessToken,
        method: 'POST',
        body: { athleteId, targetRank },
      }),
    'Участник добавлен',
  );

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath(`/attestations/${eventId}`);
  return { success: result.success };
}

/** Допуск участника. */
export async function setAdmissionAction(
  eventId: string,
  athleteId: string,
  admission: string,
): Promise<AttestationFormState> {
  const result = await withSession(
    (accessToken) =>
      apiFetch(`/certification-events/${eventId}/participants/${athleteId}`, {
        accessToken,
        method: 'PATCH',
        body: { admission },
      }),
    'Допуск обновлён',
  );

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath(`/attestations/${eventId}`);
  return { success: result.success };
}

/** Оплата экзамена: только руководитель. */
export async function setPaymentAction(
  eventId: string,
  athleteId: string,
  paymentStatus: string,
): Promise<AttestationFormState> {
  const result = await withSession(
    (accessToken) =>
      apiFetch(`/certification-events/${eventId}/participants/${athleteId}/payment`, {
        accessToken,
        method: 'PATCH',
        body: { paymentStatus },
      }),
    'Оплата обновлена',
  );

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath(`/attestations/${eventId}`);
  return { success: result.success };
}

/** Итог участника: при PASSED ступень присваивается сразу. */
export async function recordResultAction(
  eventId: string,
  athleteId: string,
  _previous: AttestationFormState,
  formData: FormData,
): Promise<AttestationFormState> {
  const result = stringField(formData, 'result');
  const awardedRank = stringField(formData, 'awardedRank');
  const comment = stringField(formData, 'comment');
  const reason = stringField(formData, 'reason');

  if (!result) {
    return { fieldErrors: { result: 'Выберите итог' }, error: 'Проверьте выделенные поля' };
  }

  const outcome = await withSession(
    (accessToken) =>
      apiFetch(`/certification-events/${eventId}/participants/${athleteId}/result`, {
        accessToken,
        method: 'POST',
        body: {
          result,
          awardedRank: result === 'PASSED' && awardedRank ? awardedRank : undefined,
          comment: comment || undefined,
          reason: reason || undefined,
        },
      }),
    result === 'PASSED' ? 'Ступень присвоена' : 'Итог сохранён',
  );

  if (outcome.error) {
    return { error: outcome.error };
  }

  revalidatePath(`/attestations/${eventId}`);
  return { success: outcome.success };
}

/** Удаление участника. */
export async function removeParticipantAction(
  eventId: string,
  athleteId: string,
): Promise<AttestationFormState> {
  const result = await withSession(
    (accessToken) =>
      apiFetch(`/certification-events/${eventId}/participants/${athleteId}`, {
        accessToken,
        method: 'DELETE',
      }),
    'Участник удалён',
  );

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath(`/attestations/${eventId}`);
  return { success: result.success };
}
