'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, describeError, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface FormState {
  error?: string;
  success?: string;
}

/**
 * Server actions админки.
 *
 * Проверка прав выполняется на backend: наличие кнопки в интерфейсе не является
 * защитой (docs/13-architecture.md). Здесь мы лишь не скрываем ошибку от
 * администратора и обновляем страницу после изменения.
 */
async function withSession<T>(
  action: (
    accessToken: string,
  ) => Promise<{ ok: true; data: T } | { ok: false; error: ApiFailure }>,
): Promise<FormState> {
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
    return { error: describeError(result.error) };
  }
  return {};
}

export async function createBranchAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get('name') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();

  if (!name) {
    return { error: 'Укажите название филиала' };
  }

  const state = await withSession((accessToken) =>
    apiFetch('/branches', {
      accessToken,
      method: 'POST',
      body: {
        name,
        ...(address ? { address } : {}),
        ...(phone ? { phone } : {}),
      },
    }),
  );

  if (!state.error) {
    revalidatePath('/branches');
    revalidatePath('/');
    return { success: `Филиал «${name}» создан` };
  }
  return state;
}

export async function archiveBranchAction(formData: FormData): Promise<void> {
  const branchId = String(formData.get('branchId') ?? '');
  if (!branchId) {
    return;
  }

  await withSession((accessToken) =>
    apiFetch(`/branches/${branchId}`, { accessToken, method: 'DELETE' }),
  );

  revalidatePath('/branches');
  revalidatePath('/');
}

/** Необязательное число: пустая строка означает «не задано». */
function optionalNumber(value: unknown): number | undefined {
  const text = String(value ?? '').trim();
  if (text === '') {
    return undefined;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function revalidateHalls(): void {
  revalidatePath('/branches');
  revalidatePath('/schedule');
}

export async function createHallAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const branchId = String(formData.get('branchId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const capacity = optionalNumber(formData.get('capacity'));

  if (!branchId) {
    return { error: 'Не указан филиал' };
  }
  if (!name) {
    return { error: 'Укажите название зала' };
  }

  const state = await withSession((accessToken) =>
    apiFetch(`/branches/${branchId}/halls`, {
      accessToken,
      method: 'POST',
      body: { name, ...(capacity === undefined ? {} : { capacity }) },
    }),
  );

  if (!state.error) {
    revalidateHalls();
    return { success: `Зал «${name}» добавлен` };
  }
  return state;
}

/**
 * Изменение зала, включая перенос в другой филиал.
 *
 * Пустая вместимость передается как null: так значение очищается. Иначе форма не
 * смогла бы убрать уже указанное число, а отправка undefined означала бы «не
 * менять» — то есть опечатку нельзя было бы исправить.
 */
export async function updateHallAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const hallId = String(formData.get('hallId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const capacityRaw = String(formData.get('capacity') ?? '').trim();
  const branchId = String(formData.get('branchId') ?? '').trim();
  const isActive = formData.get('isActive') === 'on';

  if (!hallId) {
    return { error: 'Не указан зал' };
  }
  if (!name) {
    return { error: 'Укажите название зала' };
  }

  const state = await withSession((accessToken) =>
    apiFetch(`/halls/${hallId}`, {
      accessToken,
      method: 'PATCH',
      body: {
        name,
        capacity: capacityRaw === '' ? null : Number(capacityRaw),
        isActive,
        ...(branchId ? { branchId } : {}),
      },
    }),
  );

  if (!state.error) {
    revalidateHalls();
    return { success: 'Зал обновлен' };
  }
  return state;
}

/**
 * Архивирование зала.
 *
 * Backend откажет, если в зале есть предстоящие занятия (`HALL_HAS_SESSIONS`):
 * архивный зал исчезает из выбора в расписании, и группа пришла бы в закрытый
 * зал. Ошибку показываем текстом, а не молча игнорируем.
 */
export async function archiveHallAction(formData: FormData): Promise<void> {
  const hallId = String(formData.get('hallId') ?? '');
  if (!hallId) {
    return;
  }

  await withSession((accessToken) =>
    apiFetch(`/halls/${hallId}`, { accessToken, method: 'DELETE' }),
  );

  revalidateHalls();
}
