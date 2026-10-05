import { AuditAction, AuditEntityType } from '@octagon/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AuditService } from '../src/modules/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RequestContextService } from '../src/shared/request-context.service';

/**
 * Аудит на реальной БД: запись действительно сохраняется и читается обратно,
 * включая JSON-снимки и фильтр истории.
 *
 * Требует примененной миграции в octagon_test (см. docs/27-local-development.md).
 */
describe('AuditService (db e2e, требуется PostgreSQL)', () => {
  let app: INestApplication;
  let audit: AuditService;
  let prisma: PrismaService;
  const entityId = `e2e-audit-${Date.now()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        AuditService,
        {
          provide: RequestContextService,
          useValue: {
            current: () => ({ requestId: 'e2e-req', ipAddress: '127.0.0.1', userAgent: 'jest' }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    audit = app.get(AuditService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.db.auditLog.deleteMany({ where: { entityId } });
    }
    await app?.close();
  });

  it('сохраняет и читает запись аудита с JSON-снимками', async () => {
    const saved = await audit.record({
      action: AuditAction.FREEZE_CREATED,
      entityType: AuditEntityType.FREEZE_PERIOD,
      entityId,
      before: { endedOn: null },
      after: { startedOn: '2026-03-01', reason: 'travma' },
    });

    expect(saved.id).toBeDefined();
    expect(saved.requestId).toBe('e2e-req');
    expect(saved.ipAddress).toBe('127.0.0.1');
    expect(saved.afterJson).toEqual({ startedOn: '2026-03-01', reason: 'travma' });

    const persisted = await prisma.db.auditLog.findUniqueOrThrow({ where: { id: saved.id } });
    expect(persisted.action).toBe('freeze.created');
    expect(persisted.entityType).toBe('FreezePeriod');
    expect(persisted.afterJson).toEqual({ startedOn: '2026-03-01', reason: 'travma' });
  });

  it('возвращает историю сущности по фильтру', async () => {
    const history = await audit.list({
      entityType: AuditEntityType.FREEZE_PERIOD,
      entityId,
    });

    expect(history.meta.total).toBe(1);
    expect(history.items).toHaveLength(1);
    expect(history.items[0]?.entityId).toBe(entityId);
  });
});
