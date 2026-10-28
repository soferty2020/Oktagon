import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ApiErrorCode, PermissionCode } from '@octagon/contracts';

import { AuditService } from '../audit/audit.service';
import { IdentityService } from '../identity/identity.service';
import { NewsRepository } from './news.repository';
import { NewsImagesService, type UploadedImage } from './news-images.service';

function upload(overrides: Partial<UploadedImage> = {}): UploadedImage {
  return {
    originalname: 'photo.jpg',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from('fake-image'),
    ...overrides,
  };
}

describe('NewsImagesService (#70)', () => {
  let service: NewsImagesService;
  let uploadDir: string;

  const news = {
    findById: jest.fn(),
    countImages: jest.fn(),
    addImage: jest.fn(),
    findImage: jest.fn(),
    deleteImage: jest.fn(),
  };
  const identity = { getProfile: jest.fn() };
  const audit = { recordSafely: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    uploadDir = await mkdtemp(join(tmpdir(), 'octagon-news-'));

    config.get.mockReturnValue(uploadDir);
    news.findById.mockResolvedValue({ id: 'post-1', authorId: 'author-1' });
    news.countImages.mockResolvedValue(0);
    news.addImage.mockResolvedValue({
      id: 'image-1',
      path: 'news/abc.jpg',
      width: null,
      height: null,
      position: 0,
    });
    identity.getProfile.mockResolvedValue({
      permissions: { codes: [PermissionCode.NewsEdit] },
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        NewsImagesService,
        { provide: NewsRepository, useValue: news },
        { provide: IdentityService, useValue: identity },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(NewsImagesService);
  });

  afterEach(async () => {
    await rm(uploadDir, { recursive: true, force: true });
  });

  it('автор загружает фотографию: путь относительный, файл записан', async () => {
    const result = await service.addImage('author-1', 'post-1', upload());

    expect(result.url).toBe('/media/news/abc.jpg');
    expect(news.addImage).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'post-1', position: 0 }),
    );
  });

  it('четвёртая фотография отклоняется', async () => {
    news.countImages.mockResolvedValue(3);

    await expect(service.addImage('author-1', 'post-1', upload())).rejects.toMatchObject({
      code: ApiErrorCode.VALIDATION_FAILED,
    });
    expect(news.addImage).not.toHaveBeenCalled();
  });

  it('не-картинка отклоняется по MIME', async () => {
    await expect(
      service.addImage('author-1', 'post-1', upload({ mimetype: 'application/pdf' })),
    ).rejects.toMatchObject({ code: ApiErrorCode.VALIDATION_FAILED });
  });

  it('чужую новость правит только с правом news.edit', async () => {
    identity.getProfile.mockResolvedValue({ permissions: { codes: [] } });

    await expect(service.addImage('other-1', 'post-1', upload())).rejects.toMatchObject({
      code: ApiErrorCode.FORBIDDEN,
    });
  });

  it('удаление убирает запись и файл', async () => {
    news.findImage.mockResolvedValue({
      id: 'image-1',
      path: 'news/abc.jpg',
      width: null,
      height: null,
      position: 0,
    });

    await service.removeImage('author-1', 'post-1', 'image-1');

    expect(news.deleteImage).toHaveBeenCalledWith('image-1');
    expect(audit.recordSafely).toHaveBeenCalled();
  });
});
