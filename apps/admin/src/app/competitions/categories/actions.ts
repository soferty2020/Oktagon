'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface CategoryFormState {
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

function numberField(formData: FormData, name: string): number | undefined {
  const value = stringField(formData, name);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Категории (#43).
 *
 * Справочник меняет только руководитель — это проверяет и API. Форму показываем
 * лишь тому, кому можно: иначе тренер заполнит её и получит 403 после отправки.
 */
export async function createCategoryAction(
  _previous: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const discipline = stringField(formData, 'discipline');
  const name = stringField(formData, 'name');
  const competitionId = stringField(formData, 'competitionId');

  const fieldErrors: Record<string, string> = {};
  if (!discipline) {
    fieldErrors.discipline = 'Выберите дисциплину';
  }
  if (name.length < 2) {
    fieldErrors.name = 'Название короче двух символов';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, error: 'Проверьте выделенные поля' };
  }

  const result = await withSession(
    (accessToken) =>
      apiFetch('/api/v1/competitions/categories', {
        accessToken,
        method: 'POST',
        body: {
          discipline,
          name,
          ageFrom: numberField(formData, 'ageFrom'),
          ageTo: numberField(formData, 'ageTo'),
          weightFrom: numberField(formData, 'weightFrom'),
          weightTo: numberField(formData, 'weightTo'),
          beltFrom: stringField(formData, 'beltFrom') || undefined,
          beltTo: stringField(formData, 'beltTo') || undefined,
          competitionId: competitionId || undefined,
        },
      }),
    'Категория создана',
  );

  if (result.error) {
    return { error: result.error, fieldErrors };
  }

  revalidatePath('/competitions/categories');
  if (competitionId) {
    revalidatePath(`/competitions/${competitionId}`);
  }

  return { success: result.success };
}

/** Переименование и границы: история турниров хранит снимок, поэтому правка безопасна. */
export async function updateCategoryAction(
  id: string,
  _previous: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const name = stringField(formData, 'name');

  if (name.length < 2) {
    return { fieldErrors: { name: 'Название короче двух символов' }, error: 'Проверьте поля' };
  }

  const result = await withSession(
    (accessToken) =>
      apiFetch(`/api/v1/competitions/categories/${id}`, {
        accessToken,
        method: 'PATCH',
        body: { name },
      }),
    'Категория переименована',
  );

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath('/competitions/categories');
  return { success: result.success };
}

/** Деактивация вместо удаления: категория участвует в истории турниров. */
export async function toggleCategoryAction(
  id: string,
  isActive: boolean,
): Promise<CategoryFormState> {
  const result = await withSession(
    (accessToken) =>
      apiFetch(`/api/v1/competitions/categories/${id}`, {
        accessToken,
        method: 'PATCH',
        body: { isActive },
      }),
    isActive ? 'Категория возвращена' : 'Категория снята с публикации',
  );

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath('/competitions/categories');
  return { success: result.success };
}
