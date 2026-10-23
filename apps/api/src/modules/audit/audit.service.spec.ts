import { Logger } from '@nestjs/common';
import { AuditAction, AuditEntityType } from '@octagon/contracts';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../shared/request-context.service';
import { AuditService } from './audit.service';

/**
 * BR-007: изменения прав, оплат, заморозок и расписания должны быть аудируемы.
 * Здесь проверяется контракт записи: обязательные поля, приоритет явных
 * значений над контекстом запроса и поведение при сбое.
 */
describe('AuditService', () => {
  const create = jest.fn();
  const findMany = jest.fn();
  const count = jest.fn();

  const prisma = {
    db: { auditLog: { create, findMany, count } },
  } as unknown as PrismaService;

  let requestContext: RequestContextService;
  let service: AuditService;

  beforeAll(() => {
    // Логгер сервиса не должен засорять вывод тестов.
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    requestContext = new RequestContextService();
    service = new AuditService(prisma, requestContext);
    create.mockReset().mockResolvedValue({ id: 'log-1' });
    findMany.mockReset().mockResolvedValue([]);
    count.mockReset().mockResolvedValue(0);
  });

  it('записывает обязательные поля события', async () => {
    await service.record({
      action: AuditAction.FREEZE_CREATED,
      entityType: AuditEntityType.FREEZE_PERIOD,
      entityId: 'freeze-1',
      after: { startedOn: '2026-03-01', endedOn: null },
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'freeze.created',
        entityType: 'FreezePeriod',
        entityId: 'freeze-1',
        actorUserId: null,
        requestId: null,
        ipAddress: null,
        userAgent: null,
      }),
    });
  });

  it('подставляет контекст запроса: requestId, ip, user-agent, actor', async () => {
    await requestContext.run(
      {
        requestId: 'req-42',
        ipAddress: '10.0.0.7',
        userAgent: 'jest',
        actorUserId: 'user-9',
      },
      () =>
        service.record({
          action: AuditAction.PAYMENT_RECORDED,
          entityType: AuditEntityType.PAYMENT_TRANSACTION,
          entityId: 'payment-1',
        }),
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'user-9',
        requestId: 'req-42',
        ipAddress: '10.0.0.7',
        userAgent: 'jest',
      }),
    });
  });

  it('явные значения события приоритетнее контекста запроса', async () => {
    await requestContext.run({ actorUserId: 'from-context', requestId: 'ctx-req' }, () =>
      service.record({
        action: AuditAction.USER_BLOCKED,
        entityType: AuditEntityType.USER,
        entityId: 'user-2',
        actorUserId: 'explicit-actor',
        requestId: 'explicit-req',
      }),
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'explicit-actor',
        requestId: 'explicit-req',
      }),
    });
  });

  it('передает before/after как JSON', async () => {
    await service.record({
      action: AuditAction.ATTENDANCE_UPDATED,
      entityType: AuditEntityType.ATTENDANCE,
      entityId: 'attendance-1',
      before: { status: 'ABSENT' },
      after: { status: 'EXCUSED' },
    });

    const [{ data }] = create.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data.beforeJson).toEqual({ status: 'ABSENT' });
    expect(data.afterJson).toEqual({ status: 'EXCUSED' });
  });

  it('пишет JsonNull, когда снимков нет', async () => {
    await service.record({
      action: AuditAction.NEWS_PUBLISHED,
      entityType: AuditEntityType.NEWS_POST,
    });

    const [{ data }] = create.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data.beforeJson).toBe(Prisma.JsonNull);
    expect(data.afterJson).toBe(Prisma.JsonNull);
  });

  it('не бросает исключение при сбое записи в recordSafely', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    create.mockRejectedValueOnce(new Error('db is down'));

    await expect(
      service.recordSafely({
        action: AuditAction.AUTH_LOGIN_FAILED,
        entityType: AuditEntityType.USER,
        entityId: 'user-3',
      }),
    ).resolves.toBeNull();
  });

  it('ограничивает размер страницы при выборке истории', async () => {
    await service.list({ entityType: 'FreezePeriod', entityId: 'freeze-1', limit: 9999 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200, where: { entityType: 'FreezePeriod', entityId: 'freeze-1' } }),
    );
    expect(count).toHaveBeenCalledTimes(1);
  });

  describe('журнал действий (K6)', () => {
    const row = (overrides: Record<string, unknown> = {}) => ({
      id: 'audit-1',
      action: AuditAction.SETTINGS_CLUB_UPDATED,
      entityType: AuditEntityType.CLUB_PROFILE,
      entityId: 'default',
      beforeJson: { name: 'Старое имя', phone: '+7 700 000 00 00', email: 'old@octagon.kz' },
      afterJson: { name: 'Новое имя', phone: '+7 700 111 11 11', email: 'new@octagon.kz' },
      ipAddress: '127.0.0.1',
      requestId: 'req-1',
      createdAt: new Date('2026-10-23T10:00:00.000Z'),
      actor: { id: 'user-1', email: 'admin@octagon.kz', firstName: 'Алия', lastName: 'Демо' },
      ...overrides,
    });

    it('маскирует контакты и секреты в before/after', async () => {
      // Журнал читает только суперадминистратор, но персональные данные не должны
      // размножаться по экранам: поле остается, значение скрыто.
      findMany.mockResolvedValueOnce([row()]);
      count.mockResolvedValueOnce(1);

      const page = await service.listForView({});

      const record = page.items[0];
      expect(record.before).toEqual({ name: 'Старое имя', phone: '•••', email: '•••' });
      expect(record.after).toEqual({ name: 'Новое имя', phone: '•••', email: '•••' });
      expect(JSON.stringify(record)).not.toContain('+7 700');
    });

    it('маскирует passwordHash в любом регистре и во вложенных объектах', async () => {
      findMany.mockResolvedValueOnce([
        row({
          afterJson: { user: { passwordHash: 'hash-value', accessToken: 'jwt' }, name: 'Имя' },
        }),
      ]);
      count.mockResolvedValueOnce(1);

      const page = await service.listForView({});

      expect(page.items[0].after).toEqual({
        user: { passwordHash: '•••', accessToken: '•••' },
        name: 'Имя',
      });
    });

    it('подтягивает актора и отдает курсор следующей страницы', async () => {
      findMany.mockResolvedValueOnce([row({ id: 'audit-2' }), row({ id: 'audit-1' })]);
      count.mockResolvedValueOnce(2);

      const page = await service.listForView({ limit: 2 });

      expect(page.items[0].actor).toMatchObject({ id: 'user-1', email: 'admin@octagon.kz' });
      expect(page.nextCursor).toBe('audit-1');
      expect(page.total).toBe(2);
    });

    it('не отдает курсор, если записи закончились', async () => {
      findMany.mockResolvedValueOnce([row()]);
      count.mockResolvedValueOnce(1);

      const page = await service.listForView({ limit: 2 });

      expect(page.nextCursor).toBeNull();
    });

    it('передает в запрос фильтры по действию и периоду', async () => {
      findMany.mockResolvedValueOnce([]);
      count.mockResolvedValueOnce(0);

      await service.listForView({
        action: 'settings.club_updated',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-11-01T00:00:00.000Z',
      });

      const [{ where }] = findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
      expect(where.action).toBe('settings.club_updated');
      expect(where.createdAt).toEqual({
        gte: new Date('2026-10-01T00:00:00.000Z'),
        lt: new Date('2026-11-01T00:00:00.000Z'),
      });
    });
  });
});
