'use server';

import { revalidatePath } from 'next/cache';

import { apiBaseUrl } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface NewsImageState {
  error?: string;
  success?: string;
}

/** Загружает фотографию новости (#70): multipart, до 5 МБ, не больше трёх. */
export async function uploadNewsImageAction(
  _prev: NewsImageState,
  formData: FormData,
): Promise<NewsImageState> {
  const postId = String(formData.get('postId') ?? '');
  const file = formData.get('file');

  if (!postId) {
    return { error: 'Не указана новость' };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Выберите файл' };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { error: 'Файл больше 5 МБ' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Сессия истекла, войдите заново' };
  }

  const { accessToken } = await readTokens();
  if (!accessToken) {
    return { error: 'Сессия истекла, войдите заново' };
  }

  // Отдельный fetch, а не apiFetch: тот отправляет JSON, а здесь multipart.
  const body = new FormData();
  body.append('file', file);

  const response = await fetch(`${apiBaseUrl()}/news/${postId}/images`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
    body,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return { error: payload?.message ?? 'Не удалось загрузить фотографию' };
  }

  revalidatePath(`/news/${postId}`);
  return { success: 'Фотография добавлена' };
}

/** Удаляет фотографию новости и её файл. */
export async function deleteNewsImageAction(formData: FormData): Promise<void> {
  const postId = String(formData.get('postId') ?? '');
  const imageId = String(formData.get('imageId') ?? '');

  if (!postId || !imageId) {
    return;
  }

  const { accessToken } = await readTokens();
  if (!accessToken) {
    return;
  }

  await fetch(`${apiBaseUrl()}/news/${postId}/images/${imageId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
  });

  revalidatePath(`/news/${postId}`);
}
