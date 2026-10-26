import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  canTransitionEvent,
  type CertificationEventStatus,
  type CertificationEventView,
  type CreateCertificationEventInput,
  type UpdateCertificationEventInput,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { IdentityService } from '../identity/identity.service';
import {
  CertificationEventsRepository,
  toEventView,
  type CertificationEventRecord,
} from './certification-events.repository';

/**
 * Мероприятия аттестаций (#33).
 *
 * Правила, которые нельзя проверить в DTO:
 * - менять и отменять может только создатель или суперадмин;
 * - переходы статусов ограничены (`EVENT_TRANSITIONS`), а не «любой из списка»;
 * - завершить можно только когда у всех участников есть итог;
 * - опубликованное мероприятие не отменяется — результаты уже видны родителям,
 *   исправления идут через версии результатов.
 */
@Injectable()
export class CertificationEventsService {
  private readonly logger = new Logger(CertificationEventsService.name);

  constructor(
    private readonly repository: CertificationEventsRepository,
    private readonly audit: AuditService,
    private readonly identity: IdentityService,
  ) {}

  /**
   * Список мероприятий.
   *
   * Родитель видит только те экзамены, где участвует его ребёнок: полный
   * календарь клуба ему не нужен и раскрывает чужие события (#39).
   */
  async list(
    viewer: { userId: string; role: string },
    status?: CertificationEventStatus,
  ): Promise<CertificationEventView[]> {
    const linked = await this.linkedAthleteIds(viewer);
    const records =
      linked === null
        ? await this.repository.list(status)
        : await this.repository.listForAthletes(linked, status);

    return records.map(toEventView);
  }

  async get(viewer: { userId: string; role: string }, id: string): Promise<CertificationEventView> {
    const record = await this.requireEvent(id);
    const linked = await this.linkedAthleteIds(viewer);

    if (linked !== null && !(await this.repository.hasParticipant(id, linked))) {
      throw ApiException.notFound('Мероприятие не найдено');
    }

    return toEventView(record);
  }

  async create(
    callerId: string,
    input: CreateCertificationEventInput,
  ): Promise<CertificationEventView> {
    const record = await this.repository.create({ ...input, createdById: callerId });

    await this.audit.recordSafely({
      action: AuditAction.ATTESTATION_EVENT_CREATED,
      entityType: AuditEntityType.CERTIFICATION_EVENT,
      entityId: record.id,
      actorUserId: callerId,
      after: { title: record.title, scheduledAt: record.scheduledAt.toISOString() },
    });

    this.logger.log(`Мероприятие ${record.id}: создано пользователем ${callerId}`);
    return toEventView(record);
  }

  async update(
    callerId: string,
    callerIsSuperadmin: boolean,
    id: string,
    input: UpdateCertificationEventInput,
  ): Promise<CertificationEventView> {
    const existing = await this.requireEvent(id);
    this.assertOwner(callerId, callerIsSuperadmin, existing, 'изменить');

    if (existing.status === 'PUBLISHED') {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Опубликованное мероприятие не редактируется: исправляйте результаты',
      );
    }

    const record = await this.repository.update(id, input);

    await this.audit.recordSafely({
      action: AuditAction.ATTESTATION_EVENT_UPDATED,
      entityType: AuditEntityType.CERTIFICATION_EVENT,
      entityId: id,
      actorUserId: callerId,
      before: { title: existing.title, scheduledAt: existing.scheduledAt.toISOString() },
      after: { title: record.title, scheduledAt: record.scheduledAt.toISOString() },
    });

    return toEventView(record);
  }

  /** Смена статуса: только по разрешённому переходу. */
  async transition(
    callerId: string,
    callerIsSuperadmin: boolean,
    id: string,
    to: CertificationEventStatus,
  ): Promise<CertificationEventView> {
    const existing = await this.requireEvent(id);

    if (!canTransitionEvent(existing.status, to)) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        `Из статуса «${existing.status}» нельзя перейти в «${to}»`,
      );
    }

    // Отмена и публикация — не «правка»: у них отдельные правила владения.
    if (to === 'CANCELLED') {
      this.assertOwner(callerId, callerIsSuperadmin, existing, 'отменить');
    } else {
      this.assertOwner(callerId, callerIsSuperadmin, existing, 'изменить');
    }

    if (to === 'COMPLETED') {
      const pending = await this.repository.countPendingResults(id);
      if (pending > 0) {
        throw new ApiException(
          'VALIDATION_FAILED' satisfies ApiErrorCode,
          `Нельзя завершить: у ${pending} участников нет итога`,
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
        to === 'CANCELLED' ? AuditAction.ATTESTATION_EVENT_CANCELLED : AuditAction.ATTESTATION_EVENT_UPDATED,
      entityType: AuditEntityType.CERTIFICATION_EVENT,
      entityId: id,
      actorUserId: callerId,
      before: { status: existing.status },
      after: { status: record.status },
    });

    return toEventView(record);
  }

  /** Публикация: отдельное право и только из COMPLETED. */
  async publish(
    callerId: string,
    callerIsSuperadmin: boolean,
    id: string,
  ): Promise<CertificationEventView> {
    const existing = await this.requireEvent(id);

    if (existing.status !== 'COMPLETED') {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Публиковать можно только завершённое мероприятие',
      );
    }

    this.assertOwner(callerId, callerIsSuperadmin, existing, 'опубликовать');

    const record = await this.repository.update(id, {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      publishedById: callerId,
    });

    await this.audit.recordSafely({
      action: AuditAction.ATTESTATION_EVENT_PUBLISHED,
      entityType: AuditEntityType.CERTIFICATION_EVENT,
      entityId: id,
      actorUserId: callerId,
    });

    return toEventView(record);
  }

  /**
   * Связанные спортсмены родителя; 
ull — ограничения нет (тренер, руководитель).
   */
  private async linkedAthleteIds(viewer: { userId: string; role: string }): Promise<string[] | null> {
    if (viewer.role !== 'MEMBER') {
      return null;
    }

    const athletes = await this.identity.listLinkedAthletes(viewer.userId);
    return athletes.map((athlete) => athlete.id);
  }

  private async requireEvent(id: string): Promise<CertificationEventRecord> {
    const record = await this.repository.findById(id);
    if (!record) {
      throw ApiException.notFound('Мероприятие не найдено');
    }
    return record;
  }

  /** Менять может создатель или суперадмин: тренер не правит чужой экзамен. */
  private assertOwner(
    callerId: string,
    callerIsSuperadmin: boolean,
    record: CertificationEventRecord,
    verb: string,
  ): void {
    if (callerIsSuperadmin || record.createdById === callerId) {
      return;
    }

    throw new ApiException(
      'FORBIDDEN' satisfies ApiErrorCode,
      `Только создатель мероприятия или руководитель может ${verb}`,
    );
  }
}
