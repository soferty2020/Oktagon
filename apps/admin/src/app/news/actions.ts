'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface NewsFormState {
  error?: string;
  success?: string;
  /** Идентификатор созданной новости: форма показывает ссылку на карточку. */
  createdId?: string;
}

/**
 * Server actions новостей (BR-011, ADR-0011).
 *
 * Права проверяет backend, а не форма: интерфейс лишь скрывает действия, которые
 * заведомо получат отказ. Иначе пользователь искал бы причину в собственном вводе.
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
    return { error: describeNewsError(result.error) };
  }
  return { ...(successMessage ? { success: successMessage } : {}), data: result.data };
}

function revalidateNews(postId?: string): void {
  revalidatePath('/news');
  if (postId) {
    revalidatePath(`/news/${postId}`);
  }
}

/** Создание новости: черновик или сразу публикация. */
export async function createNewsAction(
  _prev: NewsFormState,
  formData: FormData,
): Promise<NewsFormState> {
  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const publish = formData.get('publish') === 'on' || formData.get('publish') === 'true';
  const isPinned = formData.get('isPinned') === 'on';

  if (!title) {
    return { error: 'Укажите заголовок' };
  }
  if (!body) {
    return { error: 'Укажите текст новости' };
  }

  const state = await withSession<{ id: string }>(
    (accessToken) =>
      apiFetch('/news', {
        accessToken,
        method: 'POST',
        body: { title, body, publish, isPinned },
      }),
    publish ? 'Новость опубликована' : 'Черновик сохранен',
  );

  if (state.error || !state.data) {
    return { error: state.error ?? 'Новость не создана' };
  }

  revalidateNews(state.data.id);
  return { success: state.success, createdId: state.data.id };
}

/** Правка новости: автор правит свою, `news.edit` — чужую. */
export async function updateNewsAction(
  _prev: NewsFormState,
  formData: FormData,
): Promise<NewsFormState> {
  const postId = String(formData.get('postId') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const isPinned = formData.get('isPinned') === 'on';

  if (!postId) {
    return { error: 'Не указана новость' };
  }
  if (!title || !body) {
    return { error: 'Заголовок и текст не могут быть пустыми' };
  }

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/news/${postId}`, {
        accessToken,
        method: 'PATCH',
        body: { title, body, isPinned },
      }),
    'Новость обновлена',
  );

  if (!state.error) {
    revalidateNews(postId);
  }
  return state;
}

/** Публикация черновика. */
export async function publishNewsAction(formData: FormData): Promise<void> {
  const postId = String(formData.get('postId') ?? '');
  if (!postId) {
    return;
  }

  await withSession(
    (accessToken) => apiFetch(`/news/${postId}/publish`, { accessToken, method: 'POST' }),
    'Новость опубликована',
  );

  revalidateNews(postId);
}

/** Архивирование: новость убирается из ленты, но остается в истории. */
export async function archiveNewsAction(formData: FormData): Promise<void> {
  const postId = String(formData.get('postId') ?? '');
  if (!postId) {
    return;
  }

  await withSession(
    (accessToken) => apiFetch(`/news/${postId}`, { accessToken, method: 'DELETE' }),
    'Новость в архиве',
  );

  revalidateNews(postId);
}

/**
 * Комментарий к новости.
 *
 * Комментировать может любой аутентифицированный пользователь (BR-011): права на
 * чтение и обсуждение новостей в каталоге нет. Ограничение одно — новость должна
 * быть опубликована.
 */
export async function addCommentAction(
  _prev: NewsFormState,
  formData: FormData,
): Promise<NewsFormState> {
  const postId = String(formData.get('postId') ?? '');
  const body = String(formData.get('body') ?? '').trim();

  if (!postId) {
    return { error: 'Не указана новость' };
  }
  if (!body) {
    return { error: 'Комментарий пуст' };
  }

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/news/${postId}/comments`, {
        accessToken,
        method: 'POST',
        body: { body },
      }),
    'Комментарий добавлен',
  );

  if (!state.error) {
    revalidateNews(postId);
  }
  return state;
}

/** Удаление комментария: свой — автор, любой — с правом `news.moderate`. */
export async function deleteCommentAction(formData: FormData): Promise<void> {
  const commentId = String(formData.get('commentId') ?? '');
  const postId = String(formData.get('postId') ?? '');
  if (!commentId) {
    return;
  }

  await withSession(
    (accessToken) => apiFetch(`/news-comments/${commentId}`, { accessToken, method: 'DELETE' }),
    'Комментарий удален',
  );

  revalidateNews(postId || undefined);
}

function describeNewsError(error: ApiFailure): string {
  switch (error.code) {
    case 'NEWS_POST_NOT_FOUND':
      return 'Новость не найдена: возможно, ее убрали в архив';
    case 'NEWS_COMMENT_NOT_FOUND':
      return 'Комментарий не найден: возможно, его уже удалили';
    case 'NEWS_NOT_PUBLISHED':
      return 'Комментировать можно только опубликованную новость';
    case 'NEWS_POST_STATE_INVALID':
      return 'Новость в архиве: правка и повторная публикация недоступны';
    case 'FORBIDDEN':
      return 'Недостаточно прав: нужны «news.create», «news.edit», «news.delete» или «news.moderate»';
    case 'VALIDATION_FAILED':
      return 'Проверьте заголовок и текст';
    case 'SERVICE_UNAVAILABLE':
      return 'Backend API недоступен. Проверьте, что он запущен.';
    default:
      return error.message;
  }
}
