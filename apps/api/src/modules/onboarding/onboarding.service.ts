import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  type AthleteLinkCodeIssued,
  type LinkRequestCandidate,
  type LinkRequestView,
} from '@octagon/contracts';

import type { AppEnvironment } from '@octagon/config';
import { ApiException } from '../../shared/api-exception';
import { generateLinkCode, hashLinkCode } from '../../shared/link-code';
import { AuditService } from '../audit/audit.service';
import { ResourceScopeService } from '../identity/resource-scope.service';
import {
  OnboardingRepository,
  toIssuedCode,
  toLinkRequestView,
} from './onboarding.repository';

/** Срок жизни кода привязки: тот же, что у приглашения. */
const DEFAULT_TTL_HOURS = 72;

/**
 * Онбординг родителя (ADR-0015).
 *
 * Два пути привязки к ребёнку:
 * 1. Код — выдаёт тренер группы или администратор, родитель вводит в приложении.
 * 2. Заявка — когда кода нет: админ сопоставляет описание с карточкой.
 *
 * До привязки родитель не видит ни одного спортсмена: это не удобство, а
 * защита данных детей.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly repository: OnboardingRepository,
    private readonly scope: ResourceScopeService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {}

  /** Выдаёт код привязки к спортсмену. Тренер — только для своих групп. */
  async issueCode(
    callerUserId: string,
    athleteId: string,
  ): Promise<AthleteLinkCodeIssued> {
    await this.scope.assertAthleteAccess(callerUserId, athleteId);

    const code = generateLinkCode();
    const ttlHours = this.config.get('INVITE_TTL_HOURS', { infer: true }) ?? DEFAULT_TTL_HOURS;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await this.repository.clearActiveCodes(athleteId);
    const record = await this.repository.createCode({
      athleteId,
      codeHash: hashLinkCode(code),
      createdBy: callerUserId,
      expiresAt,
    });

    await this.audit.recordSafely({
      action: AuditAction.ATHLETE_LINK_CODE_ISSUED,
      entityType: AuditEntityType.ATHLETE,
      entityId: athleteId,
      after: { expiresAt: record.expiresAt.toISOString() },
    });

    // Код возвращается один раз: в базе только хеш.
    return toIssuedCode(record, code);
  }

  /**
   * Принимает код привязки.
   *
   * Неверный, истёкший и использованный код дают один ответ: иначе перебором
   * можно выяснить, какие коды существуют и к каким спортсменам относятся.
   */
  async acceptCode(userId: string, code: string): Promise<{ athleteId: string }> {
    const record = await this.repository.findCode(hashLinkCode(code));

    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new ApiException(
        'LINK_CODE_INVALID' satisfies ApiErrorCode,
        'Код недействителен или истёк',
      );
    }

    if (await this.repository.isLinked(userId, record.athleteId)) {
      throw new ApiException(
        'LINK_CODE_ALREADY_LINKED' satisfies ApiErrorCode,
        'Этот спортсмен уже привязан к вашему аккаунту',
      );
    }

    await this.repository.linkAthlete(userId, record.athleteId);
    await this.repository.markCodeUsed(record.id, userId);

    await this.audit.recordSafely({
      action: AuditAction.ATHLETE_LINKED_BY_CODE,
      entityType: AuditEntityType.ATHLETE,
      entityId: record.athleteId,
      after: { userId },
    });

    return { athleteId: record.athleteId };
  }

  /** Создаёт заявку на привязку. */
  async createRequest(
    userId: string,
    input: { firstName: string; lastName: string; birthDate?: string | null; phone?: string | null },
  ): Promise<LinkRequestView> {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();

    if (
      await this.repository.hasPendingRequest(userId, lastName, firstName)
    ) {
      throw new ApiException(
        'LINK_REQUEST_ALREADY_PENDING' satisfies ApiErrorCode,
        'Заявка на этого ребёнка уже ожидает решения',
      );
    }

    const record = await this.repository.createRequest({
      userId,
      firstName,
      lastName,
      birthDate: input.birthDate ? new Date(input.birthDate) : null,
      phone: input.phone ?? null,
    });

    await this.audit.recordSafely({
      action: AuditAction.LINK_REQUEST_CREATED,
      entityType: AuditEntityType.LINK_REQUEST,
      entityId: record.id,
      after: { userId, lastName, firstName },
    });

    return toLinkRequestView(record);
  }

  /** Свои заявки: родитель видит статус и причину отказа. */
  async listMyRequests(userId: string): Promise<LinkRequestView[]> {
    const records = await this.repository.listRequests(userId);
    return records.map(toLinkRequestView);
  }

  /** Очередь заявок для администратора. */
  async listPending(): Promise<LinkRequestView[]> {
    const records = await this.repository.listPending();
    return records.map(toLinkRequestView);
  }

  /** Кандидаты на сопоставление с заявкой. */
  async candidates(requestId: string): Promise<LinkRequestCandidate[]> {
    const request = await this.repository.findRequest(requestId);

    if (!request) {
      throw new ApiException('NOT_FOUND' satisfies ApiErrorCode, 'Заявка не найдена');
    }

    return this.repository.findCandidates({
      lastName: request.lastName,
      firstName: request.firstName,
      birthDate: request.birthDate,
    });
  }

  /** Подтверждает заявку: создаёт связь с выбранной карточкой. */
  async approve(
    reviewerId: string,
    requestId: string,
    athleteId: string,
  ): Promise<LinkRequestView> {
    await this.scope.assertAthleteAccess(reviewerId, athleteId);

    const request = await this.repository.findRequest(requestId);

    if (!request) {
      throw new ApiException('NOT_FOUND' satisfies ApiErrorCode, 'Заявка не найдена');
    }

    if (request.status !== 'PENDING') {
      throw new ApiException(
        'LINK_REQUEST_NOT_PENDING' satisfies ApiErrorCode,
        'Заявка уже рассмотрена',
      );
    }

    if (!(await this.repository.isLinked(request.userId, athleteId))) {
      await this.repository.linkAthlete(request.userId, athleteId);
    }

    const record = await this.repository.approveRequest({ requestId, athleteId, reviewerId });

    await this.audit.recordSafely({
      action: AuditAction.LINK_REQUEST_APPROVED,
      entityType: AuditEntityType.LINK_REQUEST,
      entityId: requestId,
      after: { athleteId, userId: request.userId },
    });

    return toLinkRequestView(record);
  }

  /** Отклоняет заявку с причиной: родитель увидит её в приложении. */
  async reject(
    reviewerId: string,
    requestId: string,
    reason: string,
  ): Promise<LinkRequestView> {
    const request = await this.repository.findRequest(requestId);

    if (!request) {
      throw new ApiException('NOT_FOUND' satisfies ApiErrorCode, 'Заявка не найдена');
    }

    if (request.status !== 'PENDING') {
      throw new ApiException(
        'LINK_REQUEST_NOT_PENDING' satisfies ApiErrorCode,
        'Заявка уже рассмотрена',
      );
    }

    const record = await this.repository.rejectRequest({ requestId, reason, reviewerId });

    await this.audit.recordSafely({
      action: AuditAction.LINK_REQUEST_REJECTED,
      entityType: AuditEntityType.LINK_REQUEST,
      entityId: requestId,
      after: { reason },
    });

    return toLinkRequestView(record);
  }
}
