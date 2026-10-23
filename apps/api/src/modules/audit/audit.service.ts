import { Injectable, Logger } from '@nestjs/common';
import type { AuditEvent, AuditRecordPage, AuditRecordView, Paginated } from '@octagon/contracts';
import { Prisma, type AuditLog } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../shared/request-context.service';

/** Клиент БД, в рамках которого пишется запись: сам PrismaService или транзакция. */
export type AuditDb = Prisma.TransactionClient;

export interface AuditListQuery {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  /** Действие из словаря аудита, например `settings.club_updated`. */
  action?: string;
  /** Начало периода, ISO-8601; включительно. */
  from?: string;
  /** Конец периода, ISO-8601; исключительно. */
  to?: string;
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
    const where = this.buildWhere(query);

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

  /**
   * Журнал действий для админки (K6).
   *
   * Отличия от `list`: подтягивается актор (в интерфейсе нужно имя, а не id) и
   * значения before/after проходят через redaction. Отдельный метод, а не флаг:
   * `list` используется карточками сущностей, где актор не нужен, и лишний join
   * там был бы напрасной работой.
   */
  async listForView(query: AuditListQuery): Promise<AuditRecordPage> {
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const where = this.buildWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          beforeJson: true,
          afterJson: true,
          ipAddress: true,
          requestId: true,
          createdAt: true,
          actor: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.db.auditLog.count({ where }),
    ]);

    const items: AuditRecordView[] = rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actor: row.actor,
      before: redact(row.beforeJson),
      after: redact(row.afterJson),
      ipAddress: row.ipAddress,
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
    }));

    // Курсор берется по последней записи страницы: клиент не знает внутренних
    // смещений, и при добавлении новых записей страницы не «съезжают».
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;

    return { items, nextCursor, total };
  }

  private buildWhere(query: AuditListQuery): Prisma.AuditLogWhereInput {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    return {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lt: to } : {}),
            },
          }
        : {}),
    };
  }
}

/**
 * Поля, значения которых нельзя показывать в журнале.
 *
 * Сравнение по нижнему регистру: в JSON встречаются `passwordHash` и
 * `password_hash`, и оба должны маскироваться. Контакты тоже скрываются:
 * журнал читает только суперадминистратор, но персональные данные не должны
 * размножаться по экранам без необходимости.
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'phone',
  'email',
]);

const REDACTED = '•••';

/**
 * Маскирует чувствительные значения, сохраняя форму объекта.
 *
 * Поле не вырезается, а заменяется маской: по записи должно быть видно, что
 * значение менялось, — иначе журнал теряет смысл для аудита.
 */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redact(item);
    }
    return result;
  }

  return value;
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
