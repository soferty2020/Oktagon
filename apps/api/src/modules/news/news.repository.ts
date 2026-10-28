import { Injectable } from '@nestjs/common';
import { NewsStatus } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

export interface NewsPostRecord {
  id: string;
  title: string;
  body: string;
  status: NewsStatus;
  authorId: string;
  authorFirstName: string;
  authorLastName: string;
  isPinned: boolean;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  commentsCount: number;
  images: NewsImageRecord[];
}

/** Фотография новости (#70). */
export interface NewsImageRecord {
  id: string;
  path: string;
  width: number | null;
  height: number | null;
  position: number;
}

export interface NewsCommentRecord {
  id: string;
  newsPostId: string;
  authorId: string;
  authorFirstName: string;
  authorLastName: string;
  body: string;
  deletedAt: Date | null;
  createdAt: Date;
}

/**
 * Доступ к новостям и комментариям (BR-011).
 *
 * Абстрактный класс как DI-токен: сервис не зависит от Prisma и тестируется без
 * БД (docs/13-architecture.md).
 */
export abstract class NewsRepository {
  abstract list(input: {
    status?: NewsStatus;
    includeArchived: boolean;
    /** Автор, которому видны его черновики. */
    authorId: string;
    /** Видны ли черновики и архив: у автора и модератора — да. */
    seeDrafts: boolean;
    search?: string;
  }): Promise<NewsPostRecord[]>;
  abstract findById(id: string): Promise<NewsPostRecord | null>;
  abstract create(input: {
    title: string;
    body: string;
    authorId: string;
    isPinned: boolean;
    publish: boolean;
  }): Promise<NewsPostRecord>;
  abstract update(
    id: string,
    input: { title?: string; body?: string; isPinned?: boolean },
  ): Promise<NewsPostRecord>;
  /** Публикация: проставляет publishedAt, если его еще не было. */
  abstract publish(id: string, publishedAt: Date): Promise<NewsPostRecord>;
  abstract archive(id: string, archivedAt: Date): Promise<NewsPostRecord>;

  abstract listComments(newsPostId: string): Promise<NewsCommentRecord[]>;
  abstract findComment(id: string): Promise<NewsCommentRecord | null>;
  abstract createComment(input: {
    newsPostId: string;
    authorId: string;
    body: string;
  }): Promise<NewsCommentRecord>;
  abstract softDeleteComment(id: string, deletedAt: Date): Promise<NewsCommentRecord>;

  /** Добавляет фотографию: не больше трёх на новость (#70). */
  abstract addImage(input: {
    postId: string;
    path: string;
    position: number;
  }): Promise<NewsImageRecord>;
  abstract listImages(postId: string): Promise<NewsImageRecord[]>;
  abstract countImages(postId: string): Promise<number>;
  abstract findImage(imageId: string): Promise<NewsImageRecord | null>;
  abstract deleteImage(imageId: string): Promise<void>;
}

const POST_SELECT = {
  id: true,
  title: true,
  body: true,
  status: true,
  authorId: true,
  isPinned: true,
  publishedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { firstName: true, lastName: true } },
  _count: { select: { comments: { where: { deletedAt: null } } } },
  images: {
    select: { id: true, path: true, width: true, height: true, position: true },
    orderBy: { position: 'asc' },
  },
} as const;

const COMMENT_SELECT = {
  id: true,
  newsPostId: true,
  authorId: true,
  body: true,
  deletedAt: true,
  createdAt: true,
  author: { select: { firstName: true, lastName: true } },
} as const;

@Injectable()
export class PrismaNewsRepository extends NewsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(input: {
    status?: NewsStatus;
    includeArchived: boolean;
    authorId: string;
    seeDrafts: boolean;
    search?: string;
  }): Promise<NewsPostRecord[]> {
    const posts = await this.prisma.db.newsPost.findMany({
      where: {
        // Черновики видны только автору и тем, у кого есть право на правку.
        // Условие задано в запросе, а не фильтром после выборки: иначе черновик
        // уходил бы клиенту и оставался только «не показанным».
        ...(input.seeDrafts ? {} : { status: NewsStatus.PUBLISHED }),
        ...(input.includeArchived ? {} : { archivedAt: null }),
        ...(input.status ? { status: input.status } : {}),
        ...(input.search
          ? {
              OR: [
                { title: { contains: input.search, mode: 'insensitive' as const } },
                { body: { contains: input.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: POST_SELECT,
    });

    return posts.map(toPostRecord);
  }

  async findById(id: string): Promise<NewsPostRecord | null> {
    const post = await this.prisma.db.newsPost.findUnique({ where: { id }, select: POST_SELECT });
    return post ? toPostRecord(post) : null;
  }

  async create(input: {
    title: string;
    body: string;
    authorId: string;
    isPinned: boolean;
    publish: boolean;
  }): Promise<NewsPostRecord> {
    const post = await this.prisma.db.newsPost.create({
      data: {
        title: input.title,
        body: input.body,
        authorId: input.authorId,
        isPinned: input.isPinned,
        status: input.publish ? NewsStatus.PUBLISHED : NewsStatus.DRAFT,
        publishedAt: input.publish ? new Date() : null,
      },
      select: POST_SELECT,
    });

    return toPostRecord(post);
  }

  async update(
    id: string,
    input: { title?: string; body?: string; isPinned?: boolean },
  ): Promise<NewsPostRecord> {
    const post = await this.prisma.db.newsPost.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
      },
      select: POST_SELECT,
    });

    return toPostRecord(post);
  }

  async publish(id: string, publishedAt: Date): Promise<NewsPostRecord> {
    const post = await this.prisma.db.newsPost.update({
      where: { id },
      data: { status: NewsStatus.PUBLISHED, publishedAt },
      select: POST_SELECT,
    });

    return toPostRecord(post);
  }

  async archive(id: string, archivedAt: Date): Promise<NewsPostRecord> {
    const post = await this.prisma.db.newsPost.update({
      where: { id },
      data: { status: NewsStatus.ARCHIVED, archivedAt },
      select: POST_SELECT,
    });

    return toPostRecord(post);
  }

  async listComments(newsPostId: string): Promise<NewsCommentRecord[]> {
    const comments = await this.prisma.db.newsComment.findMany({
      where: { newsPostId },
      orderBy: { createdAt: 'asc' },
      select: COMMENT_SELECT,
    });

    return comments.map(toCommentRecord);
  }

  async findComment(id: string): Promise<NewsCommentRecord | null> {
    const comment = await this.prisma.db.newsComment.findUnique({
      where: { id },
      select: COMMENT_SELECT,
    });

    return comment ? toCommentRecord(comment) : null;
  }

  async createComment(input: {
    newsPostId: string;
    authorId: string;
    body: string;
  }): Promise<NewsCommentRecord> {
    const comment = await this.prisma.db.newsComment.create({
      data: { newsPostId: input.newsPostId, authorId: input.authorId, body: input.body },
      select: COMMENT_SELECT,
    });

    return toCommentRecord(comment);
  }

  async softDeleteComment(id: string, deletedAt: Date): Promise<NewsCommentRecord> {
    const comment = await this.prisma.db.newsComment.update({
      where: { id },
      data: { deletedAt },
      select: COMMENT_SELECT,
    });

    return toCommentRecord(comment);
  }

  async addImage(input: { postId: string; path: string; position: number }): Promise<NewsImageRecord> {
    return this.prisma.db.newsImage.create({
      data: { postId: input.postId, path: input.path, position: input.position },
      select: { id: true, path: true, width: true, height: true, position: true },
    });
  }

  async listImages(postId: string): Promise<NewsImageRecord[]> {
    return this.prisma.db.newsImage.findMany({
      where: { postId },
      orderBy: { position: 'asc' },
      select: { id: true, path: true, width: true, height: true, position: true },
    });
  }

  async countImages(postId: string): Promise<number> {
    return this.prisma.db.newsImage.count({ where: { postId } });
  }

  async findImage(imageId: string): Promise<NewsImageRecord | null> {
    const image = await this.prisma.db.newsImage.findUnique({
      where: { id: imageId },
      select: { id: true, path: true, width: true, height: true, position: true },
    });

    return image ?? null;
  }

  async deleteImage(imageId: string): Promise<void> {
    await this.prisma.db.newsImage.delete({ where: { id: imageId } });
  }
}

function toPostRecord(post: {
  id: string;
  title: string;
  body: string;
  status: NewsStatus;
  authorId: string;
  isPinned: boolean;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: { firstName: string; lastName: string };
  _count: { comments: number };
  images: { id: string; path: string; width: number | null; height: number | null; position: number }[];
}): NewsPostRecord {
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    status: post.status,
    authorId: post.authorId,
    authorFirstName: post.author.firstName,
    authorLastName: post.author.lastName,
    isPinned: post.isPinned,
    publishedAt: post.publishedAt,
    archivedAt: post.archivedAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    commentsCount: post._count.comments,
    images: post.images,
  };
}

function toCommentRecord(comment: {
  id: string;
  newsPostId: string;
  authorId: string;
  body: string;
  deletedAt: Date | null;
  createdAt: Date;
  author: { firstName: string; lastName: string };
}): NewsCommentRecord {
  return {
    id: comment.id,
    newsPostId: comment.newsPostId,
    authorId: comment.authorId,
    authorFirstName: comment.author.firstName,
    authorLastName: comment.author.lastName,
    body: comment.body,
    deletedAt: comment.deletedAt,
    createdAt: comment.createdAt,
  };
}
