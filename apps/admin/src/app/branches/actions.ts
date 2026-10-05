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
  action: (accessToken: string) => Promise<{ ok: true; data: T } | { ok: false; error: ApiFailure }>,
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

export async function createBranchAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
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
