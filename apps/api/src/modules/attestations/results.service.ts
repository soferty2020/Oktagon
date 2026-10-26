import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  findRank,
  type CertificationParticipantView,
  type ParticipantResult,
  type RecordResultInput,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { ResourceScopeService } from '../identity/resource-scope.service';
import { ParticipantsRepository, ResultsRepository } from './participants.repository';
import { toParticipantView } from './participants.service';

/** Версия результата для истории исправлений. */
export interface ResultRevisionView {
  id: string;
  version: number;
  result: ParticipantResult;
  awardedRank: string | null;
  awardedRankLabel: string | null;
  comment: string | null;
  reason: string | null;
  changedBy: { id: string; email: string } | null;
  changedAt: string;
}

/**
 * Результаты аттестации (#35).
 *
 * Ключевые правила:
 * - PASSED создаёт ровно одно присвоение: повторное сохранение исправляет
 *   существующую запись, а не добавляет вторую;
 * - FAILED и NO_SHOW не меняют ступень (и отменяют прежнее присвоение, если
 *   результат исправляется с PASSED);
 * - исправление сохранённого итога требует причины: без неё история версий
 *   теряет смысл;
 * - тренер правит результаты своих спортсменов и те, за которые был ответственным
 *   (даже если спортсмен уже в другой группе).
 */
@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);

  constructor(
    private readonly participants: ParticipantsRepository,
    private readonly results: ResultsRepository,
    private readonly scope: ResourceScopeService,
    private readonly audit: AuditService,
  ) {}

  async record(
    callerId: string,
    callerIsSuperadmin: boolean,
    eventId: string,
    athleteId: string,
    input: RecordResultInput,
  ): Promise<CertificationParticipantView> {
    const participant = await this.participants.find(eventId, athleteId);
    if (!participant) {
      throw ApiException.notFound('Участник не найден');
    }

    await this.assertResultAccess(callerId, callerIsSuperadmin, participant.athleteId);

    const isCorrection = participant.result !== 'PENDING';

    if (isCorrection && !input.reason?.trim()) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Для исправления сохранённого результата укажите причину',
      );
    }

    let awardedRank: string | null = null;
    let awardedBelt: string | null = null;

    if (input.result === 'PASSED') {
      const rank = findRank(input.awardedRank ?? participant.targetRank);
      if (!rank) {
        throw new ApiException(
          'VALIDATION_FAILED' satisfies ApiErrorCode,
          'Укажите ступень из справочника для успешного результата',
        );
      }

      // Переход через несколько ступеней возможен, но требует обоснования:
      // «перескочил с 10 кю на 6 кю» — решение человека, а не расчёт.
      if (rank.id !== participant.targetRank && !input.reason?.trim()) {
        throw new ApiException(
          'VALIDATION_FAILED' satisfies ApiErrorCode,
          'Переход через ступени требует обоснования',
        );
      }

      awardedRank = rank.id;
      awardedBelt = rank.belt;
    }

    const { participant: updated, version } = await this.results.record({
      participantId: participant.id,
      athleteId,
      result: input.result,
      awardedRank,
      awardedBelt,
      certifiedOn: new Date(),
      comment: input.comment?.trim() || null,
      reason: input.reason?.trim() || null,
      changedById: callerId,
      existingCertificationId: participant.certificationId,
    });

    await this.audit.recordSafely({
      action: isCorrection ? AuditAction.ATTESTATION_RESULT_CORRECTED : AuditAction.ATTESTATION_RESULT_RECORDED,
      entityType: AuditEntityType.CERTIFICATION_PARTICIPANT,
      entityId: participant.id,
      actorUserId: callerId,
      before: isCorrection ? { result: participant.result, awardedRank: participant.awardedRank } : undefined,
      after: { result: updated.result, awardedRank: updated.awardedRank, version },
    });

    this.logger.log(`Результат ${participant.id}: ${updated.result} (версия ${version})`);
    return toParticipantView(updated);
  }

  async revisions(eventId: string, athleteId: string): Promise<ResultRevisionView[]> {
    const participant = await this.participants.find(eventId, athleteId);
    if (!participant) {
      throw ApiException.notFound('Участник не найден');
    }

    const records = await this.participants.revisions(participant.id);

    return records.map((record) => ({
      id: record.id,
      version: record.version,
      result: record.result,
      awardedRank: record.awardedRank,
      awardedRankLabel: findRank(record.awardedRank)?.label ?? null,
      comment: record.comment,
      reason: record.reason,
      changedBy: record.changedBy,
      changedAt: record.changedAt.toISOString(),
    }));
  }

  /**
   * Право на результат: руководитель — любой, тренер — свой спортсмен или
   * исторический результат, за который он был ответственным.
   */
  private async assertResultAccess(
    callerId: string,
    callerIsSuperadmin: boolean,
    athleteId: string,
  ): Promise<void> {
    if (callerIsSuperadmin) {
      return;
    }

    try {
      await this.scope.assertAthleteAccess(callerId, athleteId);
      return;
    } catch {
      // Не в зоне доступа — проверим ответственного тренера ниже.
    }

    const isResponsible = await this.participants.isResponsibleTrainer(callerId, athleteId);
    if (!isResponsible) {
      throw new ApiException('FORBIDDEN', 'Нет права на результат этого спортсмена');
    }
  }
}
