import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  findRank,
  rankLabel,
  type AddParticipantInput,
  type CertificationParticipantView,
  type ParticipantAdmission,
  type ParticipantPaymentStatus,
  type UpdateParticipantInput,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { ResourceScopeService } from '../identity/resource-scope.service';
import {
  ParticipantsRepository,
  type ParticipantRecord,
} from './participants.repository';

/**
 * Участники мероприятия (#34).
 *
 * Три правила, которые проверяются здесь, а не в DTO:
 * - тренер добавляет и ведёт только своих спортсменов (зона доступа);
 * - допуск и оплата независимы: оплату отмечает только руководитель, и она не
 *   влияет на допуск;
 * - ответственный тренер сохраняется при переводе спортсмена в другую группу —
 *   право исправлять исторический результат остаётся у него.
 */
@Injectable()
export class ParticipantsService {
  private readonly logger = new Logger(ParticipantsService.name);

  constructor(
    private readonly repository: ParticipantsRepository,
    private readonly scope: ResourceScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(eventId: string): Promise<CertificationParticipantView[]> {
    const records = await this.repository.list(eventId);
    return records.map(toParticipantView);
  }

  async add(
    callerId: string,
    eventId: string,
    input: AddParticipantInput,
    responsibleTrainerId: string | null,
  ): Promise<CertificationParticipantView> {
    // Зона доступа: тренер не добавляет чужих спортсменов. Бросает FORBIDDEN.
    await this.scope.assertAthleteAccess(callerId, input.athleteId);

    const targetRank = requireRank(input.targetRank);
    const snapshotRank = await this.repository.currentRank(input.athleteId);

    const existing = await this.repository.find(eventId, input.athleteId);
    if (existing) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Спортсмен уже добавлен в это мероприятие',
      );
    }

    const record = await this.repository.create({
      eventId,
      athleteId: input.athleteId,
      targetRank: targetRank.id,
      snapshotRank,
      responsibleTrainerId: input.responsibleTrainerId ?? responsibleTrainerId,
    });

    await this.audit.recordSafely({
      action: AuditAction.ATTESTATION_PARTICIPANT_ADDED,
      entityType: AuditEntityType.CERTIFICATION_PARTICIPANT,
      entityId: record.id,
      actorUserId: callerId,
      after: { eventId, athleteId: input.athleteId, targetRank: targetRank.id },
    });

    this.logger.log(`Участник ${record.id}: добавлен в мероприятие ${eventId}`);
    return toParticipantView(record);
  }

  async update(
    callerId: string,
    eventId: string,
    athleteId: string,
    input: UpdateParticipantInput,
  ): Promise<CertificationParticipantView> {
    const record = await this.requireParticipant(eventId, athleteId);
    await this.scope.assertAthleteAccess(callerId, athleteId);

    const patch: { targetRank?: string; admission?: ParticipantAdmission } = {};

    if (input.targetRank !== undefined) {
      patch.targetRank = requireRank(input.targetRank).id;
    }

    if (input.admission !== undefined) {
      patch.admission = input.admission;
    }

    const updated = await this.repository.update(record.id, patch);

    await this.audit.recordSafely({
      action: AuditAction.ATTESTATION_PARTICIPANT_UPDATED,
      entityType: AuditEntityType.CERTIFICATION_PARTICIPANT,
      entityId: record.id,
      actorUserId: callerId,
      before: { admission: record.admission, targetRank: record.targetRank },
      after: { admission: updated.admission, targetRank: updated.targetRank },
    });

    return toParticipantView(updated);
  }

  /**
   * Оплата экзамена.
   *
   * Отдельный метод, а не поле в `update`: право другое. Тренер ведёт допуск, но
   * отмечать оплату может только руководитель — иначе «оплачено» станет
   * субъективной отметкой без финансового следа (BR-010 не нарушается: суммы и
   * транзакции здесь нет).
   */
  async setPayment(
    callerId: string,
    callerIsSuperadmin: boolean,
    eventId: string,
    athleteId: string,
    paymentStatus: ParticipantPaymentStatus,
  ): Promise<CertificationParticipantView> {
    if (!callerIsSuperadmin) {
      throw new ApiException(
        'FORBIDDEN' satisfies ApiErrorCode,
        'Оплату экзамена отмечает только руководитель клуба',
      );
    }

    const record = await this.requireParticipant(eventId, athleteId);
    const updated = await this.repository.update(record.id, { paymentStatus });

    await this.audit.recordSafely({
      action: AuditAction.ATTESTATION_PARTICIPANT_UPDATED,
      entityType: AuditEntityType.CERTIFICATION_PARTICIPANT,
      entityId: record.id,
      actorUserId: callerId,
      before: { paymentStatus: record.paymentStatus },
      after: { paymentStatus: updated.paymentStatus },
    });

    return toParticipantView(updated);
  }

  async remove(callerId: string, eventId: string, athleteId: string): Promise<void> {
    const record = await this.requireParticipant(eventId, athleteId);
    await this.scope.assertAthleteAccess(callerId, athleteId);

    await this.repository.remove(record.id);

    await this.audit.recordSafely({
      action: AuditAction.ATTESTATION_PARTICIPANT_REMOVED,
      entityType: AuditEntityType.CERTIFICATION_PARTICIPANT,
      entityId: record.id,
      actorUserId: callerId,
      before: { eventId, athleteId },
    });
  }

  private async requireParticipant(eventId: string, athleteId: string): Promise<ParticipantRecord> {
    const record = await this.repository.find(eventId, athleteId);
    if (!record) {
      throw ApiException.notFound('Участник не найден');
    }
    return record;
  }
}

/** Ступень из каталога; неизвестная — ошибка ввода, а не «оставим как есть». */
function requireRank(id: string) {
  const rank = findRank(id);
  if (!rank) {
    throw new ApiException(
      'VALIDATION_FAILED' satisfies ApiErrorCode,
      `Ступень «${id}» отсутствует в справочнике`,
    );
  }
  return rank;
}

/** Запись → ответ API. */
export function toParticipantView(record: ParticipantRecord): CertificationParticipantView {
  return {
    id: record.id,
    eventId: record.eventId,
    athlete: record.athlete,
    responsibleTrainer: record.responsibleTrainer,
    targetRank: record.targetRank,
    targetRankLabel: rankLabel(record.targetRank),
    snapshotRank: record.snapshotRank,
    snapshotRankLabel: rankLabel(record.snapshotRank),
    admission: record.admission,
    paymentStatus: record.paymentStatus,
    result: record.result,
    awardedRank: record.awardedRank,
    awardedRankLabel: rankLabel(record.awardedRank),
    resultComment: record.resultComment,
    certificationId: record.certificationId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
