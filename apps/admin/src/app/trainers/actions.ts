'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface TrainerFormState {
  error?: string;
  success?: string;
}

/**
 * Server actions тренеров.
 *
 * Проверку прав выполняет backend: наличие формы в интерфейсе не является защитой
 * (docs/13-architecture.md). Здесь только внятные тексты ошибок и обновление
 * страницы.
 *
 * Обратите внимание на разделение прав: карточка тренера правится `branches.manage`,
 * а привязка аккаунта — `users.manage`. Это разные полномочия, и интерфейс их не
 * смешивает: администратор справочника может завести тренера, но не выдать доступ
 * в систему.
 */
async function withSession<T>(
  action: (
    accessToken: string,
  ) => Promise<{ ok: true; data: T } | { ok: false; error: ApiFailure }>,
): Promise<TrainerFormState> {
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
    return { error: describeTrainerError(result.error) };
  }
  return {};
}

/** Необязательное поле: пустая строка не должна попадать в API. */
function optional(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text === '' ? undefined : text;
}

function revalidateTrainers(): void {
  revalidatePath('/trainers');
  revalidatePath('/groups');
  revalidatePath('/schedule');
}

export async function createTrainerAction(
  _prev: TrainerFormState,
  formData: FormData,
): Promise<TrainerFormState> {
  // Имя и фамилия отдельно (#69): API больше не принимает displayName.
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const phone = optional(formData.get('phone'));
  const bio = optional(formData.get('bio'));

  if (!firstName || !lastName) {
    return { error: 'Укажите фамилию и имя тренера' };
  }

  const state = await withSession((accessToken) =>
    apiFetch('/trainers', {
      accessToken,
      method: 'POST',
      body: {
        firstName,
        lastName,
        ...(phone ? { phone } : {}),
        ...(bio ? { bio } : {}),
      },
    }),
  );

  if (!state.error) {
    revalidateTrainers();
    return { success: `Тренер «${lastName} ${firstName}» добавлен` };
  }
  return state;
}

export async function updateTrainerAction(
  _prev: TrainerFormState,
  formData: FormData,
): Promise<TrainerFormState> {
  const trainerId = String(formData.get('trainerId') ?? '');
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const bio = String(formData.get('bio') ?? '').trim();
  // Чекбокс: отсутствие в форме означает «не активен».
  const isActive = formData.get('isActive') === 'on';

  if (!trainerId) {
    return { error: 'Не указан тренер' };
  }
  if (!firstName || !lastName) {
    return { error: 'Укажите фамилию и имя тренера' };
  }

  const state = await withSession((accessToken) =>
    apiFetch(`/trainers/${trainerId}`, {
      accessToken,
      method: 'PATCH',
      // Пустые строки передаются как null: так поле очищается. Отправлять
      // `undefined` нельзя — тогда правка «ничего не меняет» молча.
      body: {
        firstName,
        lastName,
        phone: phone === '' ? null : phone,
        bio: bio === '' ? null : bio,
        isActive,
      },
    }),
  );

  if (!state.error) {
    revalidateTrainers();
    return { success: 'Профиль обновлен' };
  }
  return state;
}

/**
 * Связывание профиля тренера с аккаунтом.
 *
 * Связь дает доступ в систему, поэтому требует `users.manage`; роль аккаунта
 * проверяет backend. Интерфейс показывает только подходящие аккаунты, но это
 * удобство, а не защита.
 */
export async function linkTrainerAccountAction(
  _prev: TrainerFormState,
  formData: FormData,
): Promise<TrainerFormState> {
  const trainerId = String(formData.get('trainerId') ?? '');
  const userId = String(formData.get('userId') ?? '').trim();

  if (!trainerId) {
    return { error: 'Не указан тренер' };
  }
  if (!userId) {
    return { error: 'Выберите аккаунт' };
  }

  const state = await withSession((accessToken) =>
    apiFetch(`/trainers/${trainerId}/account`, {
      accessToken,
      method: 'POST',
      body: { userId },
    }),
  );

  if (!state.error) {
    revalidateTrainers();
    return { success: 'Аккаунт привязан: тренер сможет войти' };
  }
  return state;
}

/** Снятие связи: профиль и история занятий сохраняются. */
export async function unlinkTrainerAccountAction(formData: FormData): Promise<void> {
  const trainerId = String(formData.get('trainerId') ?? '');
  if (!trainerId) {
    return;
  }

  await withSession((accessToken) =>
    apiFetch(`/trainers/${trainerId}/account`, { accessToken, method: 'DELETE' }),
  );

  revalidateTrainers();
}

/** Архивирование профиля: тренер остается в истории занятий. */
export async function archiveTrainerAction(formData: FormData): Promise<void> {
  const trainerId = String(formData.get('trainerId') ?? '');
  if (!trainerId) {
    return;
  }

  await withSession((accessToken) =>
    apiFetch(`/trainers/${trainerId}`, { accessToken, method: 'DELETE' }),
  );

  revalidateTrainers();
}

/**
 * Тексты ошибок тренера.
 *
 * Основные случаи объясняются своими словами: «роль не подходит» и «профиль уже
 * связан» требуют разных действий от администратора, и общий текст заставил бы
 * его искать причину перебором.
 */
function describeTrainerError(error: ApiFailure): string {
  switch (error.code) {
    case 'TRAINER_ACCOUNT_ROLE_INVALID':
      return 'У аккаунта роль участника клуба: тренеру нужна роль STAFF, иначе он не увидит занятия. Создайте сотрудника приглашением с ролью STAFF.';
    case 'TRAINER_ACCOUNT_NOT_ACTIVE':
      return 'Приглашение еще не принято: аккаунт не активирован, войти он не сможет';
    case 'TRAINER_ALREADY_ASSIGNED':
      return 'С профилем или аккаунтом уже связана запись: сначала снимите прежнюю связь';
    case 'TRAINER_ACCOUNT_NOT_LINKED':
      return 'С профилем не связан аккаунт';
    case 'TRAINER_NOT_FOUND':
      return 'Тренер не найден: возможно, профиль архивирован';
    case 'FORBIDDEN':
      return 'Недостаточно прав: карточка тренера требует «branches.manage», привязка аккаунта — «users.manage»';
    case 'NOT_FOUND':
      return 'Аккаунт не найден';
    case 'SERVICE_UNAVAILABLE':
      return 'Backend API недоступен. Проверьте, что он запущен.';
    default:
      return error.message;
  }
}
