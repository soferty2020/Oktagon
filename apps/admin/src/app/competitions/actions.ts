'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface CompetitionFormState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

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

/** Создание турнира. */
export async function createCompetitionAction(
  _previous: CompetitionFormState,
  formData: FormData,
): Promise<CompetitionFormState> {
  const title = stringField(formData, 'title');
  const startsAt = stringField(formData, 'startsAt');

  const fieldErrors: Record<string, string> = {};
  if (title.length < 3) {
    fieldErrors.title = 'Название короче трёх символов';
  }
  if (!startsAt) {
    fieldErrors.startsAt = 'Укажите дату';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, error: 'Проверьте выделенные поля' };
  }

  const result = await withSession(
    (accessToken) =>
      apiFetch('/api/v1/competitions', {
        accessToken,
        method: 'POST',
        body: {
          title,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: stringField(formData, 'endsAt')
            ? new Date(stringField(formData, 'endsAt')).toISOString()
            : undefined,
          location: stringField(formData, 'location') || undefined,
          organizer: stringField(formData, 'organizer') || undefined,
          level: stringField(formData, 'level') || undefined,
          description: stringField(formData, 'description') || undefined,
        },
      }),
    'Турнир создан',
  );

  if (result.error) {
    return { error: result.error, fieldErrors };
  }

  revalidatePath('/competitions');
  return { success: result.success };
}

async function transition(id: string, action: string, success: string) {
  const result = await withSession(
    (accessToken) =>
      apiFetch(`/api/v1/competitions/${id}/${action}`, { accessToken, method: 'POST' }),
    success,
  );

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath('/competitions');
  revalidatePath(`/competitions/${id}`);
  return { success: result.success };
}

export async function planCompetitionAction(id: string): Promise<CompetitionFormState> {
  return transition(id, 'plan', 'Турнир запланирован');
}

export async function startCompetitionAction(id: string): Promise<CompetitionFormState> {
  return transition(id, 'start', 'Турнир начался');
}

export async function completeCompetitionAction(id: string): Promise<CompetitionFormState> {
  return transition(id, 'complete', 'Турнир завершён');
}

export async function cancelCompetitionAction(id: string): Promise<CompetitionFormState> {
  return transition(id, 'cancel', 'Турнир отменён: результаты остались в архиве');
}

export async function publishCompetitionAction(id: string): Promise<CompetitionFormState> {
  const result = await withSession(
    (accessToken) =>
      apiFetch(`/api/v1/competitions/${id}/publish`, { accessToken, method: 'POST' }),
    'Результаты опубликованы',
  );

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath('/competitions');
  revalidatePath(`/competitions/${id}`);
  return { success: result.success };
}

/** Заявка спортсмена на турнир. */
export async function addCompetitionParticipantAction(
  competitionId: string,
  _previous: CompetitionFormState,
  formData: FormData,
): Promise<CompetitionFormState> {
  const athleteId = stringField(formData, 'athleteId');
  if (!athleteId) {
    return { fieldErrors: { athleteId: 'Выберите спортсмена' }, error: 'Проверьте поля' };
  }

  const result = await withSession(
    (accessToken) =>
      apiFetch(`/api/v1/competitions/${competitionId}/participants`, {
        accessToken,
        method: 'POST',
        body: { athleteId },
      }),
    'Спортсмен заявлен',
  );

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath(`/competitions/${competitionId}`);
  return { success: result.success };
}

/** Оплата турнира: одна на спортсмена, не на дисциплину. */
export async function setCompetitionPaymentAction(
  competitionId: string,
  athleteId: string,
  paymentStatus: string,
): Promise<CompetitionFormState> {
  const result = await withSession(
    (accessToken) =>
      apiFetch(`/api/v1/competitions/${competitionId}/participants/${athleteId}/payment`, {
        accessToken,
        method: 'PATCH',
        body: { paymentStatus },
      }),
    'Оплата обновлена',
  );

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath(`/competitions/${competitionId}`);
  return { success: result.success };
}

/** Участие в дисциплине и категории. */
export async function addEntryAction(
  competitionId: string,
  athleteId: string,
  _previous: CompetitionFormState,
  formData: FormData,
): Promise<CompetitionFormState> {
  const discipline = stringField(formData, 'discipline');
  const categoryId = stringField(formData, 'categoryId');

  const fieldErrors: Record<string, string> = {};
  if (!discipline) {
    fieldErrors.discipline = 'Выберите дисциплину';
  }
  if (!categoryId) {
    fieldErrors.categoryId = 'Выберите категорию';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, error: 'Проверьте выделенные поля' };
  }

  const result = await withSession(
    (accessToken) =>
      apiFetch(`/api/v1/competitions/${competitionId}/participants/${athleteId}/entries`, {
        accessToken,
        method: 'POST',
        body: { discipline, categoryId },
      }),
    'Участие добавлено',
  );

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath(`/competitions/${competitionId}`);
  return { success: result.success };
}

/** Итог участия: место и медаль. */
export async function recordEntryResultAction(
  competitionId: string,
  athleteId: string,
  entryId: string,
  _previous: CompetitionFormState,
  formData: FormData,
): Promise<CompetitionFormState> {
  const result = stringField(formData, 'result');
  const placeRaw = stringField(formData, 'place');
  const medal = stringField(formData, 'medal');
  const comment = stringField(formData, 'comment');
  const reason = stringField(formData, 'reason');

  if (!result) {
    return { fieldErrors: { result: 'Выберите итог' }, error: 'Проверьте поля' };
  }

  const outcome = await withSession(
    (accessToken) =>
      apiFetch(
        `/api/v1/competitions/${competitionId}/participants/${athleteId}/entries/${entryId}/result`,
        {
          accessToken,
          method: 'POST',
          body: {
            result,
            place: placeRaw ? Number(placeRaw) : undefined,
            medal: medal || undefined,
            comment: comment || undefined,
            reason: reason || undefined,
          },
        },
      ),
    'Результат сохранён',
  );

  if (outcome.error) {
    return { error: outcome.error };
  }

  revalidatePath(`/competitions/${competitionId}`);
  return { success: outcome.success };
}

/** Встреча кумитэ. */
export async function addMatchAction(
  competitionId: string,
  athleteId: string,
  entryId: string,
  _previous: CompetitionFormState,
  formData: FormData,
): Promise<CompetitionFormState> {
  const opponentName = stringField(formData, 'opponentName');
  const round = stringField(formData, 'round');
  const result = stringField(formData, 'result');

  const fieldErrors: Record<string, string> = {};
  if (!opponentName) {
    fieldErrors.opponentName = 'Укажите соперника';
  }
  if (!round) {
    fieldErrors.round = 'Укажите раунд';
  }
  if (!result) {
    fieldErrors.result = 'Укажите результат';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, error: 'Проверьте выделенные поля' };
  }

  const outcome = await withSession(
    (accessToken) =>
      apiFetch(
        `/api/v1/competitions/${competitionId}/participants/${athleteId}/entries/${entryId}/matches`,
        {
          accessToken,
          method: 'POST',
          body: {
            round: Number(round),
            opponentName,
            opponentClub: stringField(formData, 'opponentClub') || undefined,
            result,
            note: stringField(formData, 'note') || undefined,
          },
        },
      ),
    'Встреча добавлена',
  );

  if (outcome.error) {
    return { error: outcome.error };
  }

  revalidatePath(`/competitions/${competitionId}`);
  return { success: outcome.success };
}
