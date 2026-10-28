import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  NewsStatus,
  PermissionCode,
  type CreateNewsCommentInput,
  type CreateNewsPostInput,
  type ListNewsQuery,
  type NewsCommentView,
  type NewsPostDetails,
  type NewsPostView,
  type UpdateNewsPostInput,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { IdentityService } from '../identity/identity.service';
import { NewsRepository } from './news.repository';
import type { NewsCommentRecord, NewsPostRecord } from './news.repository';

/**
 * Новости клуба и комментарии (BR-011, ADR-0011).
 *
 * Ключевые правила:
 *
 * 1. **чтение не требует права.** BR-011: новости и комментарии видны всем
 *    пользователям клуба. Права `news.*` регулируют создание, правку,
 *    архивирование и модерацию, а не видимость;
 * 2. **черновик виден только автору и тем, кто может править чужое.** Фильтр
 *    применяется в запросе к БД, а не после выборки: иначе черновик уходил бы
 *    клиенту и оставался только «не показанным»;
 * 3. **комментировать можно только опубликованное** (`NEWS_NOT_PUBLISHED`):
 *    обсуждение черновика бессмысленно, а архивная новость — история;
 * 4. удаление комментария мягкое: в ветке остается след, что он был, иначе
 *    ответы на него теряют смысл.
 */
@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(
    private readonly news: NewsRepository,
    private readonly identity: IdentityService,
    private readonly audit: AuditService,
  ) {}

  /** Список новостей: опубликованные всем, черновики — автору и модератору. */
  async list(callerUserId: string, query: ListNewsQuery): Promise<NewsPostView[]> {
    const permissions = await this.permissionsOf(callerUserId);
    const canEditOthers =
      permissions.has(PermissionCode.NewsEdit) || permissions.has(PermissionCode.NewsModerate);

    const posts = await this.news.list({
      status: query.status,
      includeArchived: query.includeArchived ?? false,
      authorId: callerUserId,
      seeDrafts: canEditOthers,
      search: query.search,
    });

    return (
      posts
        // Автор видит и свой черновик: без права на правку чужого он все равно
        // должен найти то, что написал сам.
        .filter((post) =>
          canEditOthers ? true : post.status !== NewsStatus.DRAFT || post.authorId === callerUserId,
        )
        .map((post) => toPostView(post, callerUserId, canEditOthers))
    );
  }

  /** Карточка новости с комментариями. */
  async get(callerUserId: string, postId: string): Promise<NewsPostDetails> {
    const post = await this.requireVisible(callerUserId, postId);
    const comments = await this.news.listComments(postId);
    const permissions = await this.permissionsOf(callerUserId);
    const canModerate = permissions.has(PermissionCode.NewsModerate);

    return {
      ...toPostView(post, callerUserId, this.canEdit(post, callerUserId, permissions)),
      comments: comments.map((comment) => toCommentView(comment, callerUserId, canModerate)),
    };
  }

  /** Создание новости: черновик или сразу публикация. */
  async create(callerUserId: string, input: CreateNewsPostInput): Promise<NewsPostView> {
    const title = input.title.trim();
    const body = input.body.trim();

    if (!title) {
      throw new ApiException('VALIDATION_FAILED' satisfies ApiErrorCode, 'Укажите заголовок');
    }
    if (!body) {
      throw new ApiException('VALIDATION_FAILED' satisfies ApiErrorCode, 'Укажите текст новости');
    }

    const post = await this.news.create({
      title,
      body,
      authorId: callerUserId,
      isPinned: input.isPinned ?? false,
      publish: input.publish ?? false,
    });

    await this.audit.recordSafely({
      action: post.publishedAt ? AuditAction.NEWS_PUBLISHED : AuditAction.NEWS_UPDATED,
      entityType: AuditEntityType.NEWS_POST,
      entityId: post.id,
      after: { title: post.title, status: post.status },
    });

    this.logger.log(`Новость ${post.id}: ${post.status}`);

    return toPostView(post, callerUserId, true);
  }

  /** Правка новости: автор правит свою, `news.edit` — чужую. */
  async update(
    callerUserId: string,
    postId: string,
    input: UpdateNewsPostInput,
  ): Promise<NewsPostView> {
    const post = await this.requirePost(postId);
    const permissions = await this.permissionsOf(callerUserId);

    if (!this.canEdit(post, callerUserId, permissions)) {
      throw new ApiException(
        'FORBIDDEN' satisfies ApiErrorCode,
        'Править можно свою новость или с правом «news.edit»',
      );
    }

    if (post.archivedAt) {
      // Архив — история: правка изменила бы то, что уже прочитали.
      throw new ApiException(
        'NEWS_POST_STATE_INVALID' satisfies ApiErrorCode,
        'Архивную новость нельзя изменить',
      );
    }

    const updated = await this.news.update(postId, {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.body !== undefined ? { body: input.body.trim() } : {}),
      ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
    });

    await this.audit.recordSafely({
      action: AuditAction.NEWS_UPDATED,
      entityType: AuditEntityType.NEWS_POST,
      entityId: postId,
      before: { title: post.title, isPinned: post.isPinned },
      after: { title: updated.title, isPinned: updated.isPinned },
    });

    return toPostView(updated, callerUserId, true);
  }

  /** Публикация: черновик становится виден всем. */
  async publish(callerUserId: string, postId: string): Promise<NewsPostView> {
    const post = await this.requirePost(postId);
    const permissions = await this.permissionsOf(callerUserId);

    if (!this.canEdit(post, callerUserId, permissions)) {
      throw new ApiException(
        'FORBIDDEN' satisfies ApiErrorCode,
        'Публиковать можно свою новость или с правом «news.edit»',
      );
    }

    if (post.archivedAt) {
      throw new ApiException(
        'NEWS_POST_STATE_INVALID' satisfies ApiErrorCode,
        'Архивную новость нельзя опубликовать повторно',
      );
    }

    // Дата первой публикации сохраняется: повторная публикация не должна
    // «омолаживать» новость в ленте.
    const published = await this.news.publish(postId, post.publishedAt ?? new Date());

    await this.audit.recordSafely({
      action: AuditAction.NEWS_PUBLISHED,
      entityType: AuditEntityType.NEWS_POST,
      entityId: postId,
      before: { status: post.status },
      after: { status: published.status, publishedAt: published.publishedAt?.toISOString() },
    });

    return toPostView(published, callerUserId, true);
  }

  /** Архивирование: новость убирается из ленты, но остается в истории. */
  async archive(callerUserId: string, postId: string): Promise<NewsPostView> {
    const post = await this.requirePost(postId);

    if (post.archivedAt) {
      throw new ApiException(
        'NEWS_POST_STATE_INVALID' satisfies ApiErrorCode,
        'Новость уже в архиве',
      );
    }

    const archived = await this.news.archive(postId, new Date());

    await this.audit.recordSafely({
      action: AuditAction.NEWS_ARCHIVED,
      entityType: AuditEntityType.NEWS_POST,
      entityId: postId,
      before: { status: post.status },
      after: { status: archived.status },
    });

    return toPostView(archived, callerUserId, true);
  }

  /**
   * Комментарий к новости.
   *
   * Комментировать можно только опубликованное: у черновика нет аудитории, а
   * архивная новость — история.
   */
  async addComment(
    callerUserId: string,
    postId: string,
    input: CreateNewsCommentInput,
  ): Promise<NewsCommentView> {
    const post = await this.requireVisible(callerUserId, postId);
    const body = input.body.trim();

    if (!body) {
      throw new ApiException('VALIDATION_FAILED' satisfies ApiErrorCode, 'Комментарий пуст');
    }

    if (post.status !== NewsStatus.PUBLISHED) {
      throw new ApiException(
        'NEWS_NOT_PUBLISHED' satisfies ApiErrorCode,
        'Комментировать можно только опубликованную новость',
      );
    }

    const comment = await this.news.createComment({
      newsPostId: postId,
      authorId: callerUserId,
      body,
    });
    const permissions = await this.permissionsOf(callerUserId);

    return toCommentView(comment, callerUserId, permissions.has(PermissionCode.NewsModerate));
  }

  /**
   * Удаление комментария.
   *
   * Автор удаляет свой комментарий, модератор (`news.moderate`) — любой. Иначе
   * пришлось бы либо запретить автору исправлять сказанное, либо разрешить
   * стирать чужие слова любому.
   */
  async deleteComment(
    callerUserId: string,
    commentId: string,
  ): Promise<{ id: string; isDeleted: true }> {
    const comment = await this.news.findComment(commentId);
    if (!comment || comment.deletedAt) {
      throw new ApiException(
        'NEWS_COMMENT_NOT_FOUND' satisfies ApiErrorCode,
        'Комментарий не найден',
      );
    }

    const permissions = await this.permissionsOf(callerUserId);
    const isAuthor = comment.authorId === callerUserId;
    const canModerate = permissions.has(PermissionCode.NewsModerate);

    if (!isAuthor && !canModerate) {
      throw new ApiException(
        'FORBIDDEN' satisfies ApiErrorCode,
        'Удалить можно свой комментарий или с правом «news.moderate»',
      );
    }

    await this.news.softDeleteComment(commentId, new Date());

    await this.audit.recordSafely({
      action: AuditAction.NEWS_COMMENT_DELETED,
      entityType: AuditEntityType.NEWS_COMMENT,
      entityId: commentId,
      before: { newsPostId: comment.newsPostId, authorId: comment.authorId },
      after: { deletedBy: callerUserId, asModerator: !isAuthor },
    });

    return { id: commentId, isDeleted: true };
  }

  // --- Вспомогательное -----------------------------------------------------

  /** Права вызывающего: нужны, чтобы решить, виден ли чужой черновик. */
  private async permissionsOf(userId: string): Promise<Set<string>> {
    const permissions = await this.identity.getPermissions(userId);
    return new Set(permissions.codes);
  }

  private canEdit(post: NewsPostRecord, callerUserId: string, permissions: Set<string>): boolean {
    if (post.authorId === callerUserId) {
      return true;
    }
    return permissions.has(PermissionCode.NewsEdit) || permissions.has(PermissionCode.NewsModerate);
  }

  private async requirePost(postId: string): Promise<NewsPostRecord> {
    const post = await this.news.findById(postId);
    if (!post) {
      throw new ApiException('NEWS_POST_NOT_FOUND' satisfies ApiErrorCode, 'Новость не найдена');
    }
    return post;
  }

  /**
   * Новость, которую вызывающий вправе видеть.
   *
   * Чужой черновик отдает 404, а не 403: иначе по коду ответа можно было бы
   * узнать, что неопубликованная новость существует.
   */
  private async requireVisible(callerUserId: string, postId: string): Promise<NewsPostRecord> {
    const post = await this.requirePost(postId);

    if (post.status === NewsStatus.DRAFT) {
      const permissions = await this.permissionsOf(callerUserId);
      if (!this.canEdit(post, callerUserId, permissions)) {
        throw new ApiException('NEWS_POST_NOT_FOUND' satisfies ApiErrorCode, 'Новость не найдена');
      }
    }

    return post;
  }
}

function toPostView(
  post: NewsPostRecord,
  callerUserId: string,
  canEditOthers: boolean,
): NewsPostView {
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    status: post.status as NewsStatus,
    author: {
      id: post.authorId,
      firstName: post.authorFirstName,
      lastName: post.authorLastName,
    },
    isPinned: post.isPinned,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    archivedAt: post.archivedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    commentsCount: post.commentsCount,
    // Публичный адрес: файлы раздаёт API по /media, в базе путь относительный.
    images: post.images.map((image) => ({
      id: image.id,
      url: `/media/${image.path}`,
      width: image.width,
      height: image.height,
      position: image.position,
    })),
    canEdit: post.authorId === callerUserId || canEditOthers,
  };
}

function toCommentView(
  comment: NewsCommentRecord,
  callerUserId: string,
  canModerate: boolean,
): NewsCommentView {
  const isDeleted = comment.deletedAt !== null;

  return {
    id: comment.id,
    newsPostId: comment.newsPostId,
    author: {
      id: comment.authorId,
      firstName: comment.authorFirstName,
      lastName: comment.authorLastName,
    },
    // Текст удаленного комментария не отдается: остался только след в ветке.
    body: isDeleted ? '' : comment.body,
    isDeleted,
    canDelete: !isDeleted && (comment.authorId === callerUserId || canModerate),
    createdAt: comment.createdAt.toISOString(),
  };
}
