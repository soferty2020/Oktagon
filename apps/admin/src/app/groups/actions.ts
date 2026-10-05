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
  const branchId = String(formData.get('branchId') ?? '').trim();
  const trainerId = String(formData.get('trainerId') ?? '').trim();

  if (!name) {
    return { error: 'Укажите название группы' };
  }

  const created = await withSession<{ id: string }>((accessToken) =>
    apiFetch('/groups', {
      accessToken,
      method: 'POST',
      body: { name, ...(description ? { description } : {}) },
    }),
  );
  if (created.error || !created.data) {
    return { error: created.error ?? 'Группа не создана' };
  }
  const groupId = created.data.id;

  // Связи создаются после группы: если филиал или тренер не подошли, группа уже
  // существует, и об этом нужно сказать прямо, а не терять результат.
  const warnings: string[] = [];

  if (branchId) {
    const linked = await withSession((accessToken) =>
      apiFetch(`/groups/${groupId}/branches`, {
        accessToken,
        method: 'POST',
        body: { branchId, isPrimary: true },
      }),
    );
    if (linked.error) {
      warnings.push(`филиал не привязан: ${linked.error}`);
    }
  }

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

export async function linkBranchAction(
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const groupId = String(formData.get('groupId') ?? '');
  const branchId = String(formData.get('branchId') ?? '').trim();
  const isPrimary = formData.get('isPrimary') === 'on';

  if (!branchId) {
    return { error: 'Выберите филиал' };
  }

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/groups/${groupId}/branches`, {
        accessToken,
        method: 'POST',
        body: { branchId, isPrimary },
      }),
    'Филиал привязан',
  );

  if (!state.error) {
    revalidatePath(`/groups/${groupId}`);
  }
  return state;
}

export async function unlinkBranchAction(formData: FormData): Promise<void> {
  const groupId = String(formData.get('groupId') ?? '');
  const branchId = String(formData.get('branchId') ?? '');
  if (!groupId || !branchId) {
    return;
  }

  await withSession((accessToken) =>
    apiFetch(`/groups/${groupId}/branches/${branchId}`, { accessToken, method: 'DELETE' }),
  );
  revalidatePath(`/groups/${groupId}`);
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
