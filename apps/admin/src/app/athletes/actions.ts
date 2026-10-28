'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface AthleteFormState {
  error?: string;
  success?: string;
  createdId?: string;
  /**
   * Ошибки по конкретным полям: имя поля → текст.
   *
   * Нужны, чтобы показать «Укажите имя» под полем, а не общей строкой над формой:
   * общий блок заставляет искать, что именно не так, особенно в длинной карточке.
   */
  fieldErrors?: Record<string, string>;
}

/**
 * Server actions спортсменов (C4–C5).
 *
 * Контакты сохраняет тот, у кого есть `athletes.edit`; видимость контактов
 * регулируется отдельным правом `athletes.contacts.view`, поэтому форма не
 * скрывает поля — пустые значения вернутся с backend как null.
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
    return { error: describeAthleteError(result.error) };
  }
  return { ...(successMessage ? { success: successMessage } : {}), data: result.data };
}

function describeAthleteError(error: ApiFailure): string {
  switch (error.code) {
    case 'ACCOUNT_ALREADY_LINKED':
      return 'Этот аккаунт уже связан со спортсменом';
    case 'ACCOUNT_NOT_LINKED':
      return 'Связь не найдена';
    case 'ATHLETE_NOT_FOUND':
      return 'Спортсмен не найден';
    case 'NOT_FOUND':
      return 'Пользователь не найден';
    case 'FORBIDDEN':
      return 'Недостаточно прав для этого действия, либо спортсмен вне вашей зоны доступа';
    default:
      return error.message;
  }
}

/** Необязательные текстовые поля: пустая строка не должна попадать в API. */
function optionalText(formData: FormData, name: string): string | undefined {
  const value = String(formData.get(name) ?? '').trim();
  return value === '' ? undefined : value;
}

export async function createAthleteAction(
  _prev: AthleteFormState,
  formData: FormData,
): Promise<AthleteFormState> {
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();

  if (!firstName || !lastName) {
    // Ошибки по полям, а не одной строкой: в карточке из десяти полей общий блок
    // заставляет искать, что именно не заполнено.
    const fieldErrors: Record<string, string> = {};
    if (!lastName) {
      fieldErrors.lastName = 'Укажите фамилию';
    }
    if (!firstName) {
      fieldErrors.firstName = 'Укажите имя';
    }

    return { error: 'Проверьте обязательные поля', fieldErrors };
  }

  const middleName = optionalText(formData, 'middleName');
  const birthDate = optionalText(formData, 'birthDate');
  const gender = optionalText(formData, 'gender');
  const phone = optionalText(formData, 'phone');
  const email = optionalText(formData, 'email');
  const notes = optionalText(formData, 'notes');

  const created = await withSession<{ id: string }>((accessToken) =>
    apiFetch('/athletes', {
      accessToken,
      method: 'POST',
      body: {
        firstName,
        lastName,
        ...(middleName ? { middleName } : {}),
        ...(birthDate ? { birthDate } : {}),
        ...(gender ? { gender } : {}),
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
        ...(notes ? { notes } : {}),
      },
    }),
  );

  if (created.error || !created.data) {
    return { error: created.error ?? 'Спортсмен не создан' };
  }

  revalidatePath('/athletes');
  revalidatePath('/');

  return {
    success: `Спортсмен «${lastName} ${firstName}» создан`,
    createdId: created.data.id,
  };
}

export async function updateAthleteAction(
  _prev: AthleteFormState,
  formData: FormData,
): Promise<AthleteFormState> {
  const athleteId = String(formData.get('athleteId') ?? '');
  if (!athleteId) {
    return { error: 'Не указан спортсмен' };
  }

  const status = optionalText(formData, 'status');
  const middleName = optionalText(formData, 'middleName');
  const birthDate = optionalText(formData, 'birthDate');
  const phone = optionalText(formData, 'phone');
  const email = optionalText(formData, 'email');
  const notes = optionalText(formData, 'notes');
  // Ступень — источник истины (ADR-0012), пояс выводится из неё. Пустое значение
  // означает «не определена» и просто не отправляется: иначе PATCH с пустой
  // строкой перезаписал бы реальную ступень через 400 или сброс.
  const rank = optionalText(formData, 'rank');
  const beltAwardedAt = optionalText(formData, 'beltAwardedAt');
  const hallId = optionalText(formData, 'hallId');
  const groupId = optionalText(formData, 'groupId');
  const currentGroupId = optionalText(formData, 'currentGroupId');

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/athletes/${athleteId}`, {
        accessToken,
        method: 'PATCH',
        body: {
          firstName: String(formData.get('firstName') ?? '').trim(),
          lastName: String(formData.get('lastName') ?? '').trim(),
          middleName: middleName ?? null,
          ...(birthDate ? { birthDate } : {}),
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
          notes: notes ?? null,
          // Раньше здесь был только beltGrade, и выбор ступени не сохранялся
          // вообще: пояс оставался прежним, ступень — тоже.
          ...(rank ? { rank } : {}),
          beltAwardedAt: beltAwardedAt ?? null,
          ...(status ? { status } : {}),
          // Зал: пустой выбор — «не назначен», а не «не трогать» (#68).
          hallId: hallId ?? null,
        },
      }),
    'Карточка обновлена',
  );

  // Группа меняется отдельным вызовом: состав группы — не поле карточки.
  // Ошибку привязки не прячем: карточка уже сохранена, и об этом нужно сказать.
  if (!state.error && groupId !== currentGroupId) {
    if (groupId) {
      const assigned = await withSession((accessToken) =>
        apiFetch(`/groups/${groupId}/members`, {
          accessToken,
          method: 'POST',
          body: { athleteId },
        }),
      );

      if (assigned.error) {
        return { success: 'Карточка обновлена', error: `группа не изменена: ${assigned.error}` };
      }
    } else if (currentGroupId) {
      await withSession((accessToken) =>
        apiFetch(`/groups/${currentGroupId}/members/${athleteId}`, {
          accessToken,
          method: 'DELETE',
        }),
      );
    }
  }

  if (!state.error) {
    revalidatePath(`/athletes/${athleteId}`);
    revalidatePath('/athletes');
  }
  return state;
}

export async function archiveAthleteAction(formData: FormData): Promise<void> {
  const athleteId = String(formData.get('athleteId') ?? '');
  if (!athleteId) {
    return;
  }

  await withSession((accessToken) =>
    apiFetch(`/athletes/${athleteId}`, { accessToken, method: 'DELETE' }),
  );

  revalidatePath('/athletes');
  revalidatePath('/');
}

export async function linkAccountAction(
  _prev: AthleteFormState,
  formData: FormData,
): Promise<AthleteFormState> {
  const athleteId = String(formData.get('athleteId') ?? '');
  const userId = String(formData.get('userId') ?? '').trim();
  const relation = optionalText(formData, 'relation');
  const isPrimary = formData.get('isPrimary') === 'on';

  if (!userId) {
    return { error: 'Выберите аккаунт' };
  }

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/athletes/${athleteId}/accounts`, {
        accessToken,
        method: 'POST',
        body: { userId, ...(relation ? { relation } : {}), isPrimary },
      }),
    'Аккаунт связан со спортсменом',
  );

  if (!state.error) {
    revalidatePath(`/athletes/${athleteId}`);
  }
  return state;
}

export async function unlinkAccountAction(formData: FormData): Promise<void> {
  const athleteId = String(formData.get('athleteId') ?? '');
  const userId = String(formData.get('userId') ?? '');
  if (!athleteId || !userId) {
    return;
  }

  await withSession((accessToken) =>
    apiFetch(`/athletes/${athleteId}/accounts/${userId}`, { accessToken, method: 'DELETE' }),
  );
  revalidatePath(`/athletes/${athleteId}`);
}

/** Новая аттестация: присваивает ступень и меняет текущий пояс (K8). */
export async function createCertificationAction(
  _prev: AthleteFormState,
  formData: FormData,
): Promise<AthleteFormState> {
  const athleteId = String(formData.get('athleteId') ?? '');
  if (!athleteId) {
    return { error: 'Не указан спортсмен' };
  }

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/athletes/${athleteId}/certifications`, {
        accessToken,
        method: 'POST',
        // Ступень — единый источник истины (ADR-0012): пояс и номер кю/дан API
        // выводит из неё. Старые поля не отправляются, чтобы не создать
        // противоречие между ступенью и поясом.
        body: {
          certifiedOn: String(formData.get('certifiedOn') ?? '').trim(),
          rank: String(formData.get('rank') ?? '').trim(),
          ...(String(formData.get('note') ?? '').trim()
            ? { note: String(formData.get('note')).trim() }
            : {}),
        },
      }),
    'Аттестация добавлена',
  );

  if (!state.error) {
    revalidatePath(`/athletes/${athleteId}`);
  }
  return state;
}

/** Отмена ошибочной аттестации: текущий пояс пересчитывается. */
export async function cancelCertificationAction(formData: FormData): Promise<void> {
  const athleteId = String(formData.get('athleteId') ?? '');
  const certificationId = String(formData.get('certificationId') ?? '');

  const user = await getCurrentUser();
  const { accessToken } = await readTokens();
  if (!user || !accessToken) {
    return;
  }

  await apiFetch(`/certifications/${certificationId}`, {
    accessToken,
    method: 'DELETE',
  });

  if (athleteId) {
    revalidatePath(`/athletes/${athleteId}`);
  }
}