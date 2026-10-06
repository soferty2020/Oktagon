import { AuditService } from '../audit/audit.service';
import { IdentityService } from '../identity/identity.service';
import type { NewsRepository, NewsCommentRecord, NewsPostRecord } from './news.repository';
import { NewsService } from './news.service';

const post: NewsPostRecord = {
  id: 'post-1',
  title: 'Заголовок',
  body: 'Текст новости',
  status: 'PUBLISHED',
  authorId: 'author-1',
  authorFirstName: 'Анна',
  authorLastName: 'Авторова',
  isPinned: false,
  publishedAt: new Date('2026-10-01T10:00:00.000Z'),
  archivedAt: null,
  createdAt: new Date('2026-10-01T09:00:00.000Z'),
  updatedAt: new Date('2026-10-01T10:00:00.000Z'),
  commentsCount: 0,
};

const draft: NewsPostRecord = {
  ...post,
  id: 'post-draft',
  status: 'DRAFT',
  publishedAt: null,
};

const comment: NewsCommentRecord = {
  id: 'comment-1',
  newsPostId: 'post-1',
  authorId: 'member-1',
  authorFirstName: 'Мария',
  authorLastName: 'Родитель',
  body: 'Спасибо за информацию',
  deletedAt: null,
  createdAt: new Date('2026-10-02T10:00:00.000Z'),
};

/** Пользователь без единого права: так выглядит MEMBER (ADR-0006). */
const NO_PERMISSIONS: string[] = [];
/** Права выдаются индивидуально: по роли `news.*` не выдается. */
const NEWS_EDITOR = ['news.edit'];
const MODERATOR = ['news.moderate'];

describe('NewsService', () => {
  let news: jest.Mocked<NewsRepository>;
  let identity: { getPermissions: jest.Mock };
  let audit: { recordSafely: jest.Mock };
  let service: NewsService;

  /** Права зависят от пользователя: так проверяется видимость черновиков. */
  const permissionsFor = (map: Record<string, string[]>) => {
    identity.getPermissions.mockImplementation((userId: string) =>
      Promise.resolve({ codes: map[userId] ?? NO_PERMISSIONS }),
    );
  };

  beforeEach(() => {
    news = {
      list: jest.fn().mockResolvedValue([post]),
      findById: jest.fn().mockResolvedValue(post),
      create: jest.fn().mockResolvedValue(post),
      update: jest.fn().mockResolvedValue(post),
      publish: jest.fn().mockResolvedValue(post),
      archive: jest.fn().mockResolvedValue({ ...post, status: 'ARCHIVED', archivedAt: new Date() }),
      listComments: jest.fn().mockResolvedValue([comment]),
      findComment: jest.fn().mockResolvedValue(comment),
      createComment: jest.fn().mockResolvedValue(comment),
      softDeleteComment: jest.fn().mockResolvedValue({ ...comment, deletedAt: new Date() }),
    } as unknown as jest.Mocked<NewsRepository>;

    identity = { getPermissions: jest.fn().mockResolvedValue({ codes: NO_PERMISSIONS }) };
    audit = { recordSafely: jest.fn().mockResolvedValue(null) };

    service = new NewsService(
      news,
      identity as unknown as IdentityService,
      audit as unknown as AuditService,
    );
  });

  describe('список и видимость черновиков (BR-011)', () => {
    it('передает в запрос флаг видимости черновиков по правам', async () => {
      permissionsFor({ 'moderator-1': MODERATOR });

      await service.list('moderator-1', {});

      // Фильтр уходит в БД, а не применяется после выборки: иначе черновик
      // попадал бы в ответ и оставался только «не показанным».
      expect(news.list).toHaveBeenCalledWith(expect.objectContaining({ seeDrafts: true }));
    });

    it('пользователь без прав видит только опубликованное', async () => {
      await service.list('member-1', {});

      expect(news.list).toHaveBeenCalledWith(expect.objectContaining({ seeDrafts: false }));
    });

    it('автор видит свой черновик даже без права на правку чужого', async () => {
      news.list.mockResolvedValue([{ ...draft, authorId: 'author-1' }]);

      const posts = await service.list('author-1', {});

      expect(posts).toHaveLength(1);
      expect(posts[0]?.id).toBe('post-draft');
      expect(posts[0]?.canEdit).toBe(true);
    });

    it('чужой черновик не попадает в список пользователю без прав', async () => {
      news.list.mockResolvedValue([{ ...draft, authorId: 'author-2' }]);

      await expect(service.list('member-1', {})).resolves.toEqual([]);
    });

    it('архив не запрашивается без явного флага', async () => {
      await service.list('member-1', {});

      expect(news.list).toHaveBeenCalledWith(expect.objectContaining({ includeArchived: false }));
    });
  });

  describe('карточка новости', () => {
    it('отдает комментарии и признак права на удаление', async () => {
      permissionsFor({ 'member-1': NO_PERMISSIONS });

      const details = await service.get('member-1', 'post-1');

      expect(details.comments).toHaveLength(1);
      // Свой комментарий автор удаляет даже без прав.
      expect(details.comments[0]?.canDelete).toBe(true);
      expect(details.comments[0]?.isDeleted).toBe(false);
    });

    it('чужой комментарий без модерации удалить нельзя', async () => {
      const details = await service.get('other-1', 'post-1');

      expect(details.comments[0]?.canDelete).toBe(false);
    });

    it('модератор может удалить чужой комментарий', async () => {
      permissionsFor({ 'moderator-1': MODERATOR });

      const details = await service.get('moderator-1', 'post-1');

      expect(details.comments[0]?.canDelete).toBe(true);
    });

    it('чужой черновик отдает 404, а не 403', async () => {
      news.findById.mockResolvedValue({ ...draft, authorId: 'author-2' });

      // По коду ответа нельзя узнать, что неопубликованная новость существует.
      await expect(service.get('member-1', 'post-draft')).rejects.toMatchObject({
        code: 'NEWS_POST_NOT_FOUND',
      });
    });

    it('автор открывает свой черновик', async () => {
      news.findById.mockResolvedValue({ ...draft, authorId: 'author-1' });
      news.listComments.mockResolvedValue([]);

      const details = await service.get('author-1', 'post-draft');

      expect(details.status).toBe('DRAFT');
    });

    it('удаленный комментарий не отдает текст, но остается в ветке', async () => {
      news.listComments.mockResolvedValue([{ ...comment, deletedAt: new Date() }]);

      const details = await service.get('member-1', 'post-1');

      expect(details.comments[0]?.isDeleted).toBe(true);
      expect(details.comments[0]?.body).toBe('');
      expect(details.comments[0]?.canDelete).toBe(false);
    });
  });

  describe('создание и публикация', () => {
    it('создает черновик и пишет аудит', async () => {
      news.create.mockResolvedValue(draft);

      await service.create('author-1', { title: 'Заголовок', body: 'Текст' });

      expect(news.create).toHaveBeenCalledWith(
        expect.objectContaining({ authorId: 'author-1', publish: false }),
      );
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'NewsPost' }),
      );
    });

    it('создает опубликованную новость по флагу', async () => {
      await service.create('author-1', { title: 'Заголовок', body: 'Текст', publish: true });

      expect(news.create).toHaveBeenCalledWith(expect.objectContaining({ publish: true }));
    });

    it('отклоняет пустой заголовок и текст', async () => {
      await expect(
        service.create('author-1', { title: '   ', body: 'Текст' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      await expect(
        service.create('author-1', { title: 'Заголовок', body: '  ' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(news.create).not.toHaveBeenCalled();
    });

    it('повторная публикация сохраняет дату первой', async () => {
      news.findById.mockResolvedValue({
        ...post,
        publishedAt: new Date('2026-10-01T10:00:00.000Z'),
      });

      await service.publish('author-1', 'post-1');

      // Иначе новость «омолаживалась» бы в ленте при каждой правке.
      expect(news.publish).toHaveBeenCalledWith('post-1', new Date('2026-10-01T10:00:00.000Z'));
    });

    it('не публикует архивную новость', async () => {
      news.findById.mockResolvedValue({ ...post, archivedAt: new Date(), status: 'ARCHIVED' });

      await expect(service.publish('author-1', 'post-1')).rejects.toMatchObject({
        code: 'NEWS_POST_STATE_INVALID',
      });
    });
  });

  describe('правка и архив', () => {
    it('автор правит свою новость', async () => {
      await service.update('author-1', 'post-1', { title: 'Новый' });

      expect(news.update).toHaveBeenCalled();
    });

    it('чужую новость без news.edit править нельзя', async () => {
      await expect(service.update('member-1', 'post-1', { title: 'Новый' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(news.update).not.toHaveBeenCalled();
    });

    it('news.edit позволяет править чужую новость', async () => {
      permissionsFor({ 'editor-1': NEWS_EDITOR });

      await service.update('editor-1', 'post-1', { title: 'Новый' });

      expect(news.update).toHaveBeenCalled();
    });

    it('архивную новость править нельзя', async () => {
      news.findById.mockResolvedValue({ ...post, archivedAt: new Date(), status: 'ARCHIVED' });

      await expect(service.update('author-1', 'post-1', { body: 'Правка' })).rejects.toMatchObject({
        code: 'NEWS_POST_STATE_INVALID',
      });
    });

    it('повторное архивирование отклоняется', async () => {
      news.findById.mockResolvedValue({ ...post, archivedAt: new Date(), status: 'ARCHIVED' });

      await expect(service.archive('author-1', 'post-1')).rejects.toMatchObject({
        code: 'NEWS_POST_STATE_INVALID',
      });
    });

    it('архивирование пишет аудит', async () => {
      await service.archive('author-1', 'post-1');

      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'news.archived' }),
      );
    });
  });

  describe('комментарии', () => {
    it('комментировать может пользователь без прав (BR-011)', async () => {
      await service.addComment('member-1', 'post-1', { body: 'Спасибо' });

      expect(news.createComment).toHaveBeenCalledWith({
        newsPostId: 'post-1',
        authorId: 'member-1',
        body: 'Спасибо',
      });
    });

    it('черновик комментировать нельзя', async () => {
      news.findById.mockResolvedValue({ ...draft, authorId: 'author-1' });

      await expect(
        service.addComment('author-1', 'post-draft', { body: 'Текст' }),
      ).rejects.toMatchObject({ code: 'NEWS_NOT_PUBLISHED' });
    });

    it('архивную новость комментировать нельзя', async () => {
      news.findById.mockResolvedValue({ ...post, status: 'ARCHIVED', archivedAt: new Date() });

      await expect(
        service.addComment('member-1', 'post-1', { body: 'Текст' }),
      ).rejects.toMatchObject({ code: 'NEWS_NOT_PUBLISHED' });
    });

    it('пустой комментарий отклоняется', async () => {
      await expect(service.addComment('member-1', 'post-1', { body: '   ' })).rejects.toMatchObject(
        {
          code: 'VALIDATION_FAILED',
        },
      );
    });

    it('автор удаляет свой комментарий', async () => {
      await service.deleteComment('member-1', 'comment-1');

      expect(news.softDeleteComment).toHaveBeenCalledWith('comment-1', expect.any(Date));
    });

    it('чужой комментарий без модерации удалить нельзя', async () => {
      await expect(service.deleteComment('other-1', 'comment-1')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(news.softDeleteComment).not.toHaveBeenCalled();
    });

    it('модератор удаляет чужой комментарий и это отмечено в аудите', async () => {
      permissionsFor({ 'moderator-1': MODERATOR });

      await service.deleteComment('moderator-1', 'comment-1');

      expect(news.softDeleteComment).toHaveBeenCalled();
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'news.comment_deleted',
          after: expect.objectContaining({ asModerator: true }),
        }),
      );
    });

    it('повторное удаление отклоняется', async () => {
      news.findComment.mockResolvedValue({ ...comment, deletedAt: new Date() });

      await expect(service.deleteComment('member-1', 'comment-1')).rejects.toMatchObject({
        code: 'NEWS_COMMENT_NOT_FOUND',
      });
    });
  });
});
