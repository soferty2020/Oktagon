'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface ScheduleFormState {
  error?: string;
  success?: string;
}

/**
 * Server actions расписания (эпик D).
 *
 * Права проверяет backend: интерфейс показывает понятную ошибку. Отдельно
 * переводится конфликт генерации: в `details` приходит перечень дат, и
 * администратору нужны именно они, а не общее «не удалось».
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
    return { error: describeScheduleError(result.error) };
  }
  return { ...(successMessage ? { success: successMessage } : {}), data: result.data };
}

interface ConflictDetail {
  localDate: string;
  localTime: string;
  kind: string;
  withGroupName: string;
}

/** Ошибка расписания с учетом деталей ответа. */
function describeScheduleError(error: ApiFailure): string {
  switch (error.code) {
    case 'SCHEDULE_TEMPLATE_EXISTS':
      return 'Расписание на этот квартал уже создано: расписание группы на квартал одно';
    case 'SCHEDULE_TEMPLATE_PUBLISHED':
      return 'Расписание опубликовано: слоты зафиксированы, изменения вносите в отдельные занятия';
    case 'SCHEDULE_TEMPLATE_ALREADY_PUBLISHED':
      return 'Расписание уже опубликовано';
    case 'SCHEDULE_TEMPLATE_EMPTY':
      return 'В расписании нет слотов: добавьте хотя бы один, иначе публиковать нечего';
    case 'SCHEDULE_SLOT_OVERLAPS':
      return error.message || 'Время пересекается с другим занятием';
    case 'SCHEDULE_SLOT_INVALID_TIME':
      return 'Проверьте время: окончание должно быть позже начала';
    case 'TRAINING_SESSION_CONFLICT': {
      const conflicts = (error.details?.conflicts ?? []) as ConflictDetail[];
      if (conflicts.length > 0) {
        const first = conflicts[0];
        const kind = first?.kind === 'TRAINER_BUSY' ? 'тренер уже занят' : 'зал уже занят';
        return `Расписание пересекается с другими занятиями (${conflicts.length}). Например, ${
          first?.localDate
        } в ${first?.localTime}: ${kind} в группе «${first?.withGroupName}»`;
      }
      return 'Расписание пересекается с другими занятиями';
    }
    case 'TRAINER_BUSY':
      return 'Тренер занят в это время в другой группе';
    case 'HALL_BUSY':
      return 'Зал занят в это время другой группой';
    case 'SESSION_ALREADY_STARTED':
      return 'Занятие уже началось: расписание прошедших занятий не меняется';
    case 'TRAINING_SESSION_CANCELLED':
      return 'Занятие уже отменено';
    case 'FORBIDDEN':
      return 'Недостаточно прав для этого действия';
    default:
      return error.message;
  }
}

function optionalText(formData: FormData, name: string): string | undefined {
  const value = String(formData.get(name) ?? '').trim();
  return value === '' ? undefined : value;
}

export async function createTemplateAction(
  _prev: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const groupId = String(formData.get('groupId') ?? '').trim();
  const year = Number(formData.get('year'));
  const quarter = Number(formData.get('quarter'));

  if (!groupId) {
    return { error: 'Выберите группу' };
  }
  if (!Number.isInteger(year) || !Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    return { error: 'Проверьте год и квартал' };
  }

  const state = await withSession(
    (accessToken) =>
      apiFetch('/schedule-templates', {
        accessToken,
        method: 'POST',
        body: { groupId, year, quarter },
      }),
    `Расписание на ${quarter} квартал ${year} года создано`,
  );

  if (!state.error) {
    revalidatePath('/schedule');
  }
  return state;
}

export async function addSlotAction(
  _prev: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const templateId = String(formData.get('templateId') ?? '');
  const weekday = String(formData.get('weekday') ?? '').trim();
  const startTime = String(formData.get('startTime') ?? '').trim();
  const endTime = String(formData.get('endTime') ?? '').trim();
  const hallId = optionalText(formData, 'hallId');
  const trainerId = optionalText(formData, 'trainerId');

  if (!weekday || !startTime || !endTime) {
    return { error: 'Укажите день недели и время' };
  }

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/schedule-templates/${templateId}/slots`, {
        accessToken,
        method: 'POST',
        body: {
          weekday,
          startTime,
          endTime,
          ...(hallId ? { hallId } : {}),
          ...(trainerId ? { trainerId } : {}),
        },
      }),
    'Слот добавлен',
  );

  if (!state.error) {
    revalidatePath(`/schedule/${templateId}`);
  }
  return state;
}

export async function deleteSlotAction(formData: FormData): Promise<void> {
  const templateId = String(formData.get('templateId') ?? '');
  const slotId = String(formData.get('slotId') ?? '');
  if (!templateId || !slotId) {
    return;
  }

  await withSession((accessToken) =>
    apiFetch(`/schedule-templates/${templateId}/slots/${slotId}`, {
      accessToken,
      method: 'DELETE',
    }),
  );
  revalidatePath(`/schedule/${templateId}`);
}

export async function publishTemplateAction(formData: FormData): Promise<void> {
  const templateId = String(formData.get('templateId') ?? '');
  if (!templateId) {
    return;
  }

  await withSession((accessToken) =>
    apiFetch(`/schedule-templates/${templateId}/publish`, { accessToken, method: 'POST' }),
  );
  revalidatePath(`/schedule/${templateId}`);
  revalidatePath('/schedule');
}

export async function generateSessionsAction(
  _prev: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const templateId = String(formData.get('templateId') ?? '');
  const regenerate = formData.get('regenerate') === 'on';

  const state = await withSession<{ created: number; skipped: number; removed: number }>(
    (accessToken) =>
      apiFetch(`/schedule-templates/${templateId}/generate`, {
        accessToken,
        method: 'POST',
        body: { regenerate },
      }),
  );

  if (state.error) {
    return state;
  }

  revalidatePath(`/schedule/${templateId}`);
  revalidatePath('/schedule/sessions');

  const created = state.data?.created ?? 0;
  const skipped = state.data?.skipped ?? 0;
  const removed = state.data?.removed ?? 0;

  return {
    success:
      `Создано занятий: ${created}` +
      (skipped > 0 ? `, уже было: ${skipped}` : '') +
      (removed > 0 ? `, удалено при пересоздании: ${removed}` : ''),
  };
}

export async function moveSessionAction(
  _prev: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const sessionId = String(formData.get('sessionId') ?? '');
  const date = String(formData.get('date') ?? '').trim();
  const startTime = String(formData.get('startTime') ?? '').trim();
  const endTime = String(formData.get('endTime') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  const hallId = optionalText(formData, 'hallId');

  if (!date || !startTime || !endTime) {
    return { error: 'Укажите дату и время' };
  }
  if (!reason) {
    return { error: 'Укажите причину переноса: ее увидит родитель' };
  }

  // Время вводится в локальном времени клуба, поэтому смещение вычисляет
  // backend по CLUB_TIMEZONE; здесь отправляется момент с явным смещением
  // местного времени.
  const startsAt = new Date(`${date}T${startTime}:00`).toISOString();
  const endsAt = new Date(`${date}T${endTime}:00`).toISOString();

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/training-sessions/${sessionId}/move`, {
        accessToken,
        method: 'PATCH',
        body: { startsAt, endsAt, ...(hallId ? { hallId } : {}), reason },
      }),
    'Занятие перенесено, шаблон не изменился',
  );

  if (!state.error) {
    revalidatePath('/schedule/sessions');
  }
  return state;
}

export async function cancelSessionAction(
  _prev: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const sessionId = String(formData.get('sessionId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();

  if (!reason) {
    return { error: 'Укажите причину отмены' };
  }

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/training-sessions/${sessionId}/cancel`, {
        accessToken,
        method: 'POST',
        body: { reason },
      }),
    'Занятие отменено',
  );

  if (!state.error) {
    revalidatePath('/schedule/sessions');
  }
  return state;
}
