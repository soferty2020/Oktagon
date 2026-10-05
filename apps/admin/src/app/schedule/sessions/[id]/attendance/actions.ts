'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface AttendanceFormState {
  error?: string;
  success?: string;
}

/**
 * Server actions посещаемости (эпик E).
 *
 * Отметка отправляется по одному спортсмену: тренер отмечает по ходу занятия, а
 * не заполняет весь журнал сразу. Повторная отметка обновляет статус — так
 * исправляют ошибку.
 */
async function withSession<T>(
  action: (
    accessToken: string,
  ) => Promise<{ ok: true; data: T } | { ok: false; error: ApiFailure }>,
  successMessage?: string,
): Promise<AttendanceFormState> {
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
    return { error: describeAttendanceError(result.error) };
  }
  return successMessage ? { success: successMessage } : {};
}

function describeAttendanceError(error: ApiFailure): string {
  switch (error.code) {
    case 'ATHLETE_NOT_IN_GROUP':
      return 'Спортсмен не числился в группе на дату занятия: отметить его нельзя';
    case 'ATTENDANCE_NOT_FOUND':
      return 'Отметка не найдена: возможно, ее уже сняли';
    case 'PLANNED_ABSENCE_NOT_FOUND':
      return 'Предупреждение об отсутствии не найдено';
    case 'TRAINING_SESSION_NOT_FOUND':
      return 'Занятие не найдено';
    case 'FORBIDDEN':
      return 'Недостаточно прав для этого действия, либо занятие вне вашей зоны доступа';
    default:
      return error.message;
  }
}

/** Отметка одного спортсмена: статус приходит значением кнопки. */
export async function markAttendanceAction(
  _prev: AttendanceFormState,
  formData: FormData,
): Promise<AttendanceFormState> {
  const sessionId = String(formData.get('sessionId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '');
  const status = String(formData.get('status') ?? '').trim();
  const comment = String(formData.get('comment') ?? '').trim();

  if (!sessionId || !athleteId || !status) {
    return { error: 'Не удалось определить спортсмена или статус' };
  }

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/training-sessions/${sessionId}/attendance`, {
        accessToken,
        method: 'PUT',
        body: { marks: [{ athleteId, status, ...(comment ? { comment } : {}) }] },
      }),
    'Отметка сохранена',
  );

  if (!state.error) {
    revalidatePath(`/schedule/sessions/${sessionId}/attendance`);
  }
  return state;
}

export async function resetAttendanceAction(formData: FormData): Promise<void> {
  const sessionId = String(formData.get('sessionId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '');
  if (!sessionId || !athleteId) {
    return;
  }

  await withSession((accessToken) =>
    apiFetch(`/training-sessions/${sessionId}/attendance/${athleteId}`, {
      accessToken,
      method: 'DELETE',
    }),
  );
  revalidatePath(`/schedule/sessions/${sessionId}/attendance`);
}

/** Предупреждение родителя о планируемом отсутствии (BR-008). */
export async function reportAbsenceAction(
  _prev: AttendanceFormState,
  formData: FormData,
): Promise<AttendanceFormState> {
  const sessionId = String(formData.get('sessionId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();

  if (!athleteId) {
    return { error: 'Выберите спортсмена' };
  }

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/training-sessions/${sessionId}/attendance/planned-absence`, {
        accessToken,
        method: 'POST',
        body: { athleteId, ...(reason ? { reason } : {}) },
      }),
    'Предупреждение сохранено: итог подтвердит тренер',
  );

  if (!state.error) {
    revalidatePath(`/schedule/sessions/${sessionId}/attendance`);
  }
  return state;
}

export async function cancelAbsenceAction(formData: FormData): Promise<void> {
  const sessionId = String(formData.get('sessionId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '');
  if (!sessionId || !athleteId) {
    return;
  }

  await withSession((accessToken) =>
    apiFetch(`/training-sessions/${sessionId}/attendance/planned-absence/${athleteId}`, {
      accessToken,
      method: 'DELETE',
    }),
  );
  revalidatePath(`/schedule/sessions/${sessionId}/attendance`);
}
