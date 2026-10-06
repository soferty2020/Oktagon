/**
 * Контракт новостей клуба (эпик G, BR-011).
 *
 * BR-011: «Новости и комментарии видны всем пользователям клуба». Поэтому права
 * на чтение нет: список и комментарии доступны любому аутентифицированному
 * пользователю, а `news.*` регулируют создание, правку, архивирование и
 * модерацию (ADR-0011).
 *
 * Черновик виден только автору и тем, у кого есть `news.edit` или
 * `news.moderate`: иначе недописанная новость ушла бы всей школе.
 */

import type { NewsStatus } from './domain';

export type { NewsStatus };

/** Автор новости или комментария: интерфейсу достаточно имени. */
export interface NewsAuthorView {
  id: string;
  firstName: string;
  lastName: string;
}

/** Комментарий к новости. */
export interface NewsCommentView {
  id: string;
  newsPostId: string;
  author: NewsAuthorView;
  body: string;
  /**
   * Комментарий удален.
   *
   * Удаление мягкое (ADR-0011): в ветке остается след, что комментарий был,
   * иначе ответы на него теряют смысл. Текст удаленного не отдается.
   */
  isDeleted: boolean;
  /** Может ли текущий пользователь удалить этот комментарий. */
  canDelete: boolean;
  createdAt: string;
}

/** Новость клуба. */
export interface NewsPostView {
  id: string;
  title: string;
  body: string;
  status: NewsStatus;
  author: NewsAuthorView;
  isPinned: boolean;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  commentsCount: number;
  /** Может ли текущий пользователь править, публиковать или архивировать. */
  canEdit: boolean;
}

/** Новость вместе с комментариями: отдельный запрос на карточку. */
export interface NewsPostDetails extends NewsPostView {
  comments: NewsCommentView[];
}

export interface CreateNewsPostInput {
  title: string;
  body: string;
  /** true — опубликовать сразу; иначе останется черновиком. */
  publish?: boolean;
  isPinned?: boolean;
}

export interface UpdateNewsPostInput {
  title?: string;
  body?: string;
  isPinned?: boolean;
}

export interface CreateNewsCommentInput {
  body: string;
}

/**
 * Фильтр списка новостей.
 *
 * По умолчанию отдаются опубликованные: черновики попадают в список только по
 * явному запросу и только автору или модератору.
 */
export interface ListNewsQuery {
  status?: NewsStatus;
  search?: string;
  includeArchived?: boolean;
}
