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
});
