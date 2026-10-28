import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  PermissionCode,
  type NewsImageView,
} from '@octagon/contracts';

import type { AppEnvironment } from '@octagon/config';
import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { IdentityService } from '../identity/identity.service';
import { NewsRepository } from './news.repository';

/** Больше трёх фотографий на новость не нужно: список и карточка не резиновые. */
const MAX_IMAGES = 3;

/** 5 МБ: фото с телефона проходит, тяжёлый RAW — нет. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Файл, как его отдаёт multer в памяти. */
export interface UploadedImage {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Фотографии новостей (#70).
 *
 * Хранение — на диске сервера: том `uploads`, наружу отдаётся по `/media/`.
 * Отдельный сервис, а не метод `NewsService`: загрузка файлов — операция с
 * файловой системой, и её ошибки не должны попадать в логику публикации.
 */
@Injectable()
export class NewsImagesService {
  private readonly logger = new Logger(NewsImagesService.name);

  constructor(
    private readonly news: NewsRepository,
    private readonly identity: IdentityService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {}

  /** Загружает фотографию: проверяет права, лимит и тип, пишет файл. */
  async addImage(
    callerUserId: string,
    postId: string,
    file: UploadedImage,
  ): Promise<NewsImageView> {
    const post = await this.news.findById(postId);

    if (!post) {
      throw new ApiException('NOT_FOUND' satisfies ApiErrorCode, 'Новость не найдена');
    }

    await this.assertCanEdit(callerUserId, post.authorId);

    if (!IMAGE_MIME_TYPES.includes(file.mimetype as (typeof IMAGE_MIME_TYPES)[number])) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Поддерживаются только JPEG, PNG и WebP',
      );
    }

    const count = await this.news.countImages(postId);
    if (count >= MAX_IMAGES) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        `К новости можно добавить не больше ${MAX_IMAGES} фотографий`,
      );
    }

    const extension = EXTENSIONS[file.mimetype] ?? extname(file.originalname) ?? '.jpg';
    const filename = `${randomUUID()}${extension}`;
    const relativePath = `news/${filename}`;
    const directory = join(this.uploadDir(), 'news');

    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, filename), file.buffer);

    const image = await this.news.addImage({
      postId,
      path: relativePath,
      position: count,
    });

    await this.audit.recordSafely({
      action: AuditAction.NEWS_IMAGE_ADDED,
      entityType: AuditEntityType.NEWS_POST,
      entityId: postId,
      after: { path: relativePath, size: file.size },
    });

    return toImageView(image);
  }

  /** Удаляет фотографию и её файл: осиротевшие файлы занимают диск. */
  async removeImage(callerUserId: string, postId: string, imageId: string): Promise<void> {
    const post = await this.news.findById(postId);

    if (!post) {
      throw new ApiException('NOT_FOUND' satisfies ApiErrorCode, 'Новость не найдена');
    }

    await this.assertCanEdit(callerUserId, post.authorId);

    const image = await this.news.findImage(imageId);

    if (!image) {
      throw new ApiException('NOT_FOUND' satisfies ApiErrorCode, 'Фотография не найдена');
    }

    await this.news.deleteImage(imageId);

    // Ошибку удаления файла не пробрасываем: запись уже удалена, и повтор
    // оставил бы пользователя с ошибкой при визуально пустой галерее.
    try {
      await unlink(join(this.uploadDir(), image.path));
    } catch (error) {
      this.logger.warn(`Файл ${image.path} не удалён: ${String(error)}`);
    }

    await this.audit.recordSafely({
      action: AuditAction.NEWS_IMAGE_REMOVED,
      entityType: AuditEntityType.NEWS_POST,
      entityId: postId,
      before: { path: image.path },
    });
  }

  private uploadDir(): string {
    return this.config.get('UPLOAD_DIR', { infer: true }) ?? './uploads';
  }

  /** Править фотографии может автор новости или тот, у кого есть `news.edit`. */
  private async assertCanEdit(callerUserId: string, authorId: string): Promise<void> {
    if (callerUserId === authorId) {
      return;
    }

    const profile = await this.identity.getProfile(callerUserId);

    if (!profile.permissions.codes.includes(PermissionCode.NewsEdit)) {
      throw new ApiException(
        'FORBIDDEN' satisfies ApiErrorCode,
        'Нет права на редактирование новости',
      );
    }
  }
}

function toImageView(image: {
  id: string;
  path: string;
  width: number | null;
  height: number | null;
  position: number;
}): NewsImageView {
  return {
    id: image.id,
    url: `/media/${image.path}`,
    width: image.width,
    height: image.height,
    position: image.position,
  };
}
