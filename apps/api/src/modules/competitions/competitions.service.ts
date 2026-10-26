import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  canTransitionCompetition,
  type CompetitionStatus,
  type CompetitionView,
  type CreateCompetitionInput,
  type UpdateCompetitionInput,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import {
  CompetitionsRepository,
  toCompetitionView,
  type CompetitionRecord,
} from './competitions.repository';

/**
 * Турниры (#36).
 *
 * Те же правила владения и переходов, что у мероприятий аттестаций, но с одной
 * разницей: завершение блокируется, пока есть участие без итога — иначе турнир
 * «завершён» с незаполненными результатами, и публиковать нечего.
 */
@Injectable()
export class CompetitionsService {
  private readonly logger = new Logger(CompetitionsService.name);

  constructor(
    private readonly repository: CompetitionsRepository,
    private readonly audit: AuditService,
  ) {}

  async list(status?: CompetitionStatus): Promise<CompetitionView[]> {
    return (await this.repository.list(status)).map(toCompetitionView);
  }

  async get(id: string): Promise<CompetitionView> {
    return toCompetitionView(await this.requireCompetition(id));
  }

  async create(callerId: string, input: CreateCompetitionInput): Promise<CompetitionView> {
    const record = await this.repository.create({ ...input, createdById: callerId });

    await this.audit.recordSafely({
      action: AuditAction.COMPETITION_CREATED,
      entityType: AuditEntityType.COMPETITION,
      entityId: record.id,
      actorUserId: callerId,
      after: { title: record.title, startsAt: record.startsAt.toISOString() },
    });

    this.logger.log(`Турнир ${record.id}: создан пользователем ${callerId}`);
    return toCompetitionView(record);
  }

  async update(
    callerId: string,
    callerIsSuperadmin: boolean,
    id: string,
    input: UpdateCompetitionInput,
  ): Promise<CompetitionView> {
    const existing = await this.requireCompetition(id);
    this.assertOwner(callerId, callerIsSuperadmin, existing, 'изменить');

    if (existing.status === 'PUBLISHED') {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Опубликованный турнир не редактируется: исправляйте результаты',
      );
    }

    const record = await this.repository.update(id, input);

    await this.audit.recordSafely({
      action: AuditAction.COMPETITION_UPDATED,
      entityType: AuditEntityType.COMPETITION,
      entityId: id,
      actorUserId: callerId,
      before: { title: existing.title },
      after: { title: record.title },
    });

    return toCompetitionView(record);
  }

  async transition(
    callerId: string,
    callerIsSuperadmin: boolean,
    id: string,
    to: CompetitionStatus,
  ): Promise<CompetitionView> {
    const existing = await this.requireCompetition(id);

    if (!canTransitionCompetition(existing.status, to)) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        `Из статуса «${existing.status}» нельзя перейти в «${to}»`,
      );
    }

    this.assertOwner(
      callerId,
      callerIsSuperadmin,
      existing,
      to === 'CANCELLED' ? 'отменить' : 'изменить',
    );

    if (to === 'COMPLETED') {
      const pending = await this.repository.countPendingEntries(id);
      if (pending > 0) {
        throw new ApiException(
          'VALIDATION_FAILED' satisfies ApiErrorCode,
          `Нельзя завершить: у ${pending} участий нет итога`,
        );
      }
    }

    const patch: Record<string, unknown> = { status: to };
    if (to === 'CANCELLED') {
      patch.cancelledAt = new Date();
    }

    const record = await this.repository.update(id, patch as never);

    await this.audit.recordSafely({
      action:
        to === 'CANCELLED' ? AuditAction.COMPETITION_CANCELLED : AuditAction.COMPETITION_UPDATED,
      entityType: AuditEntityType.COMPETITION,
      entityId: id,
      actorUserId: callerId,
      before: { status: existing.status },
      after: { status: record.status },
    });

    return toCompetitionView(record);
  }

  async publish(
    callerId: string,
    callerIsSuperadmin: boolean,
    id: string,
  ): Promise<CompetitionView> {
    const existing = await this.requireCompetition(id);

    if (existing.status !== 'COMPLETED') {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Публиковать можно только завершённый турнир',
      );
    }

    this.assertOwner(callerId, callerIsSuperadmin, existing, 'опубликовать');

    const record = await this.repository.update(id, {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      publishedById: callerId,
    });

    await this.audit.recordSafely({
      action: AuditAction.COMPETITION_PUBLISHED,
      entityType: AuditEntityType.COMPETITION,
      entityId: id,
      actorUserId: callerId,
    });

    return toCompetitionView(record);
  }

  private async requireCompetition(id: string): Promise<CompetitionRecord> {
    const record = await this.repository.findById(id);
    if (!record) {
      throw ApiException.notFound('Турнир не найден');
    }
    return record;
  }

  private assertOwner(
    callerId: string,
    callerIsSuperadmin: boolean,
    record: CompetitionRecord,
    verb: string,
  ): void {
    if (callerIsSuperadmin || record.createdById === callerId) {
      return;
    }

    throw new ApiException(
      'FORBIDDEN' satisfies ApiErrorCode,
      `Только создатель турнира или руководитель может ${verb}`,
    );
  }
}
