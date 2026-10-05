import { Injectable, Logger } from '@nestjs/common';
import type { AuditEvent, Paginated } from '@octagon/contracts';
import { Prisma, type AuditLog } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../shared/request-context.service';

/** Клиент БД, в рамках которого пишется запись: сам PrismaService или транзакция. */
export type AuditDb = Prisma.TransactionClient;

export interface AuditListQuery {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  limit?: number;
  cursor?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Запись в audit log (BR-007).
 *
 * Модули вызывают record() в той же транзакции, что и само изменение, чтобы
 * аудит не расходился с данными. Контекст запроса (requestId, ip, user-agent,
 * actor) подтягивается автоматически.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  /**
   * Записывает событие аудита.
   *
   * @param event описание изменения; before/after — снимки сущности.
   * @param db клиент БД: передайте транзакцию, чтобы запись была атомарной.
   */
  async record(event: AuditEvent, db?: AuditDb): Promise<AuditLog> {
    const context = this.requestContext.current();
    const client = db ?? this.prisma.db;

    const entry = await client.auditLog.create({
      data: {
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId ?? null,
        actorUserId: pick(event.actorUserId, context.actorUserId) ?? null,
        beforeJson: toJsonInput(event.before),
        afterJson: toJsonInput(event.after),
        ipAddress: pick(event.ipAddress, context.ipAddress) ?? null,
        userAgent: pick(event.userAgent, context.userAgent) ?? null,
        requestId: pick(event.requestId, context.requestId) ?? null,
      },
    });

    this.logger.debug(
      `audit ${entry.action} ${entry.entityType}${entry.entityId ? `#${entry.entityId}` : ''} by ${
        entry.actorUserId ?? 'anonymous'
      }`,
    );

    return entry;
  }

  /**
   * Записывает событие, не ломая основную операцию при сбое аудита.
   *
   * Используется там, где потеря записи аудита не должна отменять уже
   * совершенное действие (например, фиксация неудачной попытки входа).
   */
  async recordSafely(event: AuditEvent, db?: AuditDb): Promise<AuditLog | null> {
    try {
      return await this.record(event, db);
    } catch (error) {
      this.logger.error(
        `Не удалось записать аудит ${event.action} ${event.entityType}`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  /** История изменений сущности — для карточки в админке. */
  async list(query: AuditListQuery): Promise<Paginated<AuditLog>> {
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const where = {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.prisma.db.auditLog.count({ where }),
    ]);

    return {
      items,
      meta: {
        page: 1,
        perPage: limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}

/** Явное значение события имеет приоритет над контекстом запроса. */
function pick<T>(explicit: T | undefined, fromContext: T | undefined): T | undefined {
  return explicit ?? fromContext;
}

/** Prisma требует явный JsonNull вместо undefined для nullable Json-полей. */
function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
