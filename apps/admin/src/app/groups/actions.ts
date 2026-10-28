'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
export interface GroupFormState {
  error?: string;
  success?: string;
}

/**
 * Server actions групп (C6–C8).
 *
 * Права проверяет backend: интерфейс лишь показывает понятную ошибку. Ответ
 * `ACTIVE_MEMBERSHIP_EXISTS` содержит текущую группу спортсмена, поэтому для
 * этого кода формируется отдельное пояснение — администратору важно понимать,
 * откуда переводить спортсмена.
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
    return { error: describeGroupError(result.error) };
  }
  return { ...(successMessage ? { success: successMessage } : {}), data: result.data };
}

/** Пояснение ошибки с учетом деталей ответа. */
function describeGroupError(error: ApiFailure): string {
  switch (error.code) {
    case 'ACTIVE_MEMBERSHIP_EXISTS': {
      const group = error.details?.currentGroupName;
      return group
        ? `У спортсмена уже есть активная группа «${group}»: сначала завершите текущее членство`
        : 'У спортсмена уже есть активная группа: сначала завершите текущее членство';
    }
    case 'GROUP_TRAINER_ALREADY_ASSIGNED':
      return 'Тренер уже ведет эту группу';
    case 'GROUP_BRANCH_ALREADY_LINKED':
      return 'Филиал уже привязан к группе';
    case 'ATHLETE_ALREADY_MEMBER':
      return 'Спортсмен уже состоит в этой группе';
    case 'GROUP_ARCHIVED':
      return 'Группа неактивна: сначала включите ее';
    case 'FORBIDDEN':
      return 'Недостаточно прав для этого действия';
    default:
      return error.message;
  }
}

export async function createGroupAction(
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const hallId = String(formData.get('hallId') ?? '').trim();
  const trainerId = String(formData.get('trainerId') ?? '').trim();

  if (!name) {
    return { error: 'Укажите название группы' };
  }

  const created = await withSession<{ id: string }>((accessToken) =>
    apiFetch('/groups', {
      accessToken,
      method: 'POST',
      body: { name, ...(description ? { description } : {}), ...(hallId ? { hallId } : {}) },
    }),
  );
  if (created.error || !created.data) {
    return { error: created.error ?? 'Группа не создана' };
  }
  const groupId = created.data.id;

  // Тренер назначается после группы: если он не подошёл, группа уже существует,
  // и об этом нужно сказать прямо, а не терять результат.
  const warnings: string[] = [];

  if (trainerId) {
    const assigned = await withSession((accessToken) =>
      apiFetch(`/groups/${groupId}/trainers`, {
        accessToken,
        method: 'POST',
        body: { trainerId, isPrimary: true },
      }),
    );
    if (assigned.error) {
      warnings.push(`тренер не назначен: ${assigned.error}`);
    }
  }

  revalidatePath('/groups');
  revalidatePath('/');

  if (warnings.length > 0) {
    return { success: `Группа «${name}» создана, но ${warnings.join('; ')}` };
  }
  return { success: `Группа «${name}» создана` };
}

export async function archiveGroupAction(formData: FormData): Promise<void> {
  const groupId = String(formData.get('groupId') ?? '');
  if (!groupId) {
    return;
  }

  await withSession((accessToken) =>
    apiFetch(`/groups/${groupId}`, { accessToken, method: 'DELETE' }),
  );

  revalidatePath('/groups');
  revalidatePath('/');
}

/**
 * Перенос группы в другой зал (#65).
 *
 * Группа живёт в одном зале: смена зала перевозит и её спортсменов. Отдельного
 * «списка филиалов группы» больше нет — зал один.
 */
export async function setGroupHallAction(
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const groupId = String(formData.get('groupId') ?? '');
  const hallId = String(formData.get('hallId') ?? '').trim();

  if (!hallId) {
    return { error: 'Выберите зал' };
  }

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/groups/${groupId}`, {
        accessToken,
        method: 'PATCH',
        body: { hallId },
      }),
    'Зал группы обновлён',
  );

  if (!state.error) {
    revalidatePath(`/groups/${groupId}`);
  }
  return state;
}

export async function assignTrainerAction(
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const groupId = String(formData.get('groupId') ?? '');
  const trainerId = String(formData.get('trainerId') ?? '').trim();
  const isPrimary = formData.get('isPrimary') === 'on';

  if (!trainerId) {
    return { error: 'Выберите тренера' };
  }

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/groups/${groupId}/trainers`, {
        accessToken,
        method: 'POST',
        body: { trainerId, isPrimary },
      }),
    'Тренер назначен',
  );

  if (!state.error) {
    revalidatePath(`/groups/${groupId}`);
  }
  return state;
}

export async function unassignTrainerAction(formData: FormData): Promise<void> {
  const groupId = String(formData.get('groupId') ?? '');
  const trainerId = String(formData.get('trainerId') ?? '');
  if (!groupId || !trainerId) {
    return;
  }

  await withSession((accessToken) =>
    apiFetch(`/groups/${groupId}/trainers/${trainerId}`, { accessToken, method: 'DELETE' }),
  );
  revalidatePath(`/groups/${groupId}`);
}

export async function addMemberAction(
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const groupId = String(formData.get('groupId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '').trim();
  const joinedAt = String(formData.get('joinedAt') ?? '').trim();

  if (!athleteId) {
    return { error: 'Выберите спортсмена' };
  }

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/groups/${groupId}/members`, {
        accessToken,
        method: 'POST',
        body: { athleteId, ...(joinedAt ? { joinedAt } : {}) },
      }),
    'Спортсмен добавлен в группу',
  );

  if (!state.error) {
    revalidatePath(`/groups/${groupId}`);
    revalidatePath('/groups');
  }
  return state;
}

/**
 * Добавление из списка найденных спортсменов (#71).
 *
 * Форма поиска отправляет обычный POST, а не `useActionState`: результат —
 * обновлённая страница, отдельного состояния с ошибкой здесь не нужно.
 */
export async function addMemberFormAction(formData: FormData): Promise<void> {
  await addMemberAction({}, formData);
}

export async function endMembershipAction(formData: FormData): Promise<void> {
  const groupId = String(formData.get('groupId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '');
  if (!groupId || !athleteId) {
    return;
  }

  await withSession((accessToken) =>
    apiFetch(`/groups/${groupId}/members/${athleteId}`, { accessToken, method: 'DELETE' }),
  );
  revalidatePath(`/groups/${groupId}`);
  revalidatePath('/groups');
}
