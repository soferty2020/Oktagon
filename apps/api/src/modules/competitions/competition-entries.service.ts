import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  type CompetitionDiscipline,
  type CompetitionEntryResult,
  type CompetitionMedal,
  type CompetitionMatchResult,
  type ParticipantPaymentStatus,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { ResourceScopeService } from '../identity/resource-scope.service';
import {
  EntriesRepository,
  type CategoryRecord,
  type EntryRecord,
  type MatchRecord,
} from './entries.repository';

/**
 * Категории, участники и результаты турнира (#37–#38).
 *
 * Правила, которые проверяются здесь:
 * - справочник категорий меняет только руководитель; турнирная категория — часть
 *   подготовки турнира, но не правка общего справочника;
 * - категория сохраняется снимком в участии: правка справочника не переписывает
 *   историю;
 * - дубликат «тот же спортсмен в той же категории» запрещён, разные дисциплины —
 *   разрешены;
 * - оплата одна на турнир: кумитэ и ката не удваивают её;
 * - PLACED требует места, NO_SHOW не может иметь медаль, ката не имеет встреч;
 * - исправление опубликованного результата требует причины и версионируется.
 */
@Injectable()
export class CompetitionEntriesService {
  private readonly logger = new Logger(CompetitionEntriesService.name);

  constructor(
    private readonly repository: EntriesRepository,
    private readonly scope: ResourceScopeService,
    private readonly audit: AuditService,
  ) {}

  async listCategories(competitionId?: string): Promise<CategoryRecord[]> {
    return this.repository.listCategories(competitionId);
  }

  async createCategory(
    callerIsSuperadmin: boolean,
    input: Parameters<EntriesRepository['createCategory']>[0],
  ): Promise<CategoryRecord> {
    if (!callerIsSuperadmin) {
      throw new ApiException('FORBIDDEN', 'Справочник категорий меняет только руководитель');
    }

    return this.repository.createCategory(input);
  }

  async updateCategory(
    callerId: string,
    callerIsSuperadmin: boolean,
    id: string,
    patch: Record<string, unknown>,
  ): Promise<CategoryRecord> {
    if (!callerIsSuperadmin) {
      throw new ApiException('FORBIDDEN', 'Справочник категорий меняет только руководитель');
    }

    const record = await this.repository.updateCategory(id, patch);

    await this.audit.recordSafely({
      action: AuditAction.COMPETITION_UPDATED,
      entityType: AuditEntityType.COMPETITION_CATEGORY,
      entityId: id,
      actorUserId: callerId,
      after: { name: record.name, isActive: record.isActive },
    });

    return record;
  }

  /** Спортсмен в турнире: одна оплата на весь турнир. */
  async addParticipant(
    callerId: string,
    competitionId: string,
    athleteId: string,
    responsibleTrainerId: string | null,
  ) {
    await this.scope.assertAthleteAccess(callerId, athleteId);

    const existing = await this.repository.findParticipant(competitionId, athleteId);
    if (existing) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Спортсмен уже заявлен на этот турнир',
      );
    }

    const record = await this.repository.createParticipant({
      competitionId,
      athleteId,
      responsibleTrainerId,
    });

    await this.audit.recordSafely({
      action: AuditAction.COMPETITION_PARTICIPANT_ADDED,
      entityType: AuditEntityType.COMPETITION_PARTICIPANT,
      entityId: record.id,
      actorUserId: callerId,
      after: { competitionId, athleteId },
    });

    return record;
  }

  /**
   * Оплата: тренер меняет оплату своих спортсменов, руководитель — всех.
   *
   * В отличие от аттестаций, здесь тренеру разрешено: сбор на турнир ведёт
   * тренер, и отдельный человек для отметки не нужен.
   */
  async setPayment(
    callerId: string,
    competitionId: string,
    athleteId: string,
    paymentStatus: ParticipantPaymentStatus,
  ) {
    const participant = await this.repository.findParticipant(competitionId, athleteId);
    if (!participant) {
      throw ApiException.notFound('Спортсмен не заявлен на турнир');
    }

    await this.scope.assertAthleteAccess(callerId, athleteId);

    return this.repository.updateParticipant(participant.id, { paymentStatus });
  }

  async listParticipants(competitionId: string) {
    return this.repository.listParticipants(competitionId);
  }

  /** Участие в дисциплине: категория сохраняется снимком. */
  async addEntry(
    callerId: string,
    competitionId: string,
    athleteId: string,
    discipline: CompetitionDiscipline,
    categoryId: string,
  ): Promise<EntryRecord> {
    const participant = await this.repository.findParticipant(competitionId, athleteId);
    if (!participant) {
      throw ApiException.notFound('Спортсмен не заявлен на турнир');
    }

    await this.scope.assertAthleteAccess(callerId, athleteId);

    const category = await this.repository.findCategory(categoryId);
    if (!category) {
      throw ApiException.notFound('Категория не найдена');
    }

    if (category.discipline !== discipline) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        `Категория «${category.name}» относится к другой дисциплине`,
      );
    }

    const existing = await this.repository.findEntry(participant.id, categoryId);
    if (existing) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Спортсмен уже заявлен в эту категорию',
      );
    }

    const entry = await this.repository.createEntry({
      participantId: participant.id,
      categoryId,
      discipline,
      categorySnapshot: category.name,
    });

    await this.audit.recordSafely({
      action: AuditAction.COMPETITION_ENTRY_ADDED,
      entityType: AuditEntityType.COMPETITION_ENTRY,
      entityId: entry.id,
      actorUserId: callerId,
      after: { competitionId, athleteId, discipline, category: category.name },
    });

    return entry;
  }

  /** Итог участия: место и медаль независимы, ката без встреч. */
  async recordResult(
    callerId: string,
    competitionId: string,
    athleteId: string,
    entryId: string,
    input: {
      result: CompetitionEntryResult;
      place?: number;
      medal?: CompetitionMedal;
      comment?: string;
      reason?: string;
    },
  ): Promise<EntryRecord> {
    const participant = await this.repository.findParticipant(competitionId, athleteId);
    if (!participant) {
      throw ApiException.notFound('Спортсмен не заявлен на турнир');
    }

    await this.scope.assertAthleteAccess(callerId, athleteId);

    const entry = await this.repository.findEntryById(entryId);
    if (!entry || entry.participantId !== participant.id) {
      throw ApiException.notFound('Участие не найдено');
    }

    const place = input.result === 'PLACED' ? (input.place ?? null) : null;
    if (input.result === 'PLACED' && (!place || place < 1)) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Для призового результата укажите место',
      );
    }

    const medal = input.medal ?? 'NONE';
    if (input.result === 'NO_SHOW' && medal !== 'NONE') {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Неявившийся не может иметь медаль',
      );
    }

    const isPublished = await this.repository.isPublished(competitionId);
    const isCorrection = entry.result !== 'PENDING';

    if (isPublished && isCorrection && !input.reason?.trim()) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Для исправления опубликованного результата укажите причину',
      );
    }

    const updated = await this.repository.recordResult({
      entryId,
      result: input.result,
      place,
      medal,
      comment: input.comment?.trim() || null,
      reason: input.reason?.trim() || null,
      changedById: callerId,
      // Версионируем исправления опубликованного: до публикации правка — обычная
      // операция, после — изменение уже показанного родителям результата.
      withRevision: isPublished && isCorrection,
    });

    await this.audit.recordSafely({
      action:
        isPublished && isCorrection
          ? AuditAction.COMPETITION_RESULT_CORRECTED
          : AuditAction.COMPETITION_RESULT_RECORDED,
      entityType: AuditEntityType.COMPETITION_ENTRY,
      entityId: entryId,
      actorUserId: callerId,
      before: { result: entry.result, place: entry.place, medal: entry.medal },
      after: { result: updated.result, place: updated.place, medal: updated.medal },
    });

    this.logger.log(`Результат участия ${entryId}: ${updated.result}`);
    return updated;
  }

  /** Встреча кумитэ: только для KUMITE. */
  async addMatch(
    callerId: string,
    competitionId: string,
    athleteId: string,
    entryId: string,
    input: {
      round: number;
      opponentName: string;
      opponentClub?: string;
      result: CompetitionMatchResult;
      note?: string;
    },
  ): Promise<MatchRecord> {
    const participant = await this.repository.findParticipant(competitionId, athleteId);
    if (!participant) {
      throw ApiException.notFound('Спортсмен не заявлен на турнир');
    }

    await this.scope.assertAthleteAccess(callerId, athleteId);

    const entry = await this.repository.findEntryById(entryId);
    if (!entry || entry.participantId !== participant.id) {
      throw ApiException.notFound('Участие не найдено');
    }

    if (entry.discipline !== 'KUMITE') {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Встречи ведутся только для кумитэ: ката оценивается итоговым местом',
      );
    }

    const match = await this.repository.createMatch({
      entryId,
      round: input.round,
      opponentName: input.opponentName,
      opponentClub: input.opponentClub?.trim() || null,
      result: input.result,
      note: input.note?.trim() || null,
    });

    await this.audit.recordSafely({
      action: AuditAction.COMPETITION_MATCH_RECORDED,
      entityType: AuditEntityType.COMPETITION_ENTRY,
      entityId: entryId,
      actorUserId: callerId,
      after: { round: input.round, opponent: input.opponentName, result: input.result },
    });

    return match;
  }

  async listMatches(entryId: string): Promise<MatchRecord[]> {
    return this.repository.listMatches(entryId);
  }
}
