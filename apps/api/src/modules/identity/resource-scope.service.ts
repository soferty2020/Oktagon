import { Injectable, Logger } from '@nestjs/common';
import { ApiErrorCode, canAccessAthlete, canAccessGroup, type ScopeDecision } from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { IdentityRepository, type UserProfileRecord } from './identity.repository';

/**
 * Ресурсный scope (issue B6).
 *
 * Реализует вторую половину правила из docs/21-permission-matrix.md: наличие
 * permission само по себе не дает доступа к чужой группе или спортсмену.
 * Модули (athletes, groups, attendance, ...) должны вызывать эти методы перед
 * выдачей данных, а не полагаться только на PermissionsGuard.
 *
 * Модель scope в MVP (ADR-0006): SUPERADMIN — все; MEMBER — связанные через
 * UserAthlete спортсмены; STAFF — свои группы либо все при `scopeAllGroups`.
 * Scope по филиалам появится вместе с таблицей scope и нового ADR.
 */
@Injectable()
export class ResourceScopeService {
  private readonly logger = new Logger(ResourceScopeService.name);

  constructor(private readonly repository: IdentityRepository) {}

  /** Виден ли спортсмен пользователю. */
  async checkAthlete(userId: string, athleteId: string): Promise<ScopeDecision> {
    const record = await this.requireUser(userId);

    if (record.role === 'MEMBER') {
      const linked = await this.repository.listLinkedAthletes(userId);
      return canAccessAthlete(
        { role: record.role, linkedAthleteIds: linked.map((athlete) => athlete.athleteId) },
        athleteId,
      );
    }

    const coached =
      record.role === 'STAFF' ? await this.repository.listCoachedAthleteIds(userId) : [];

    return canAccessAthlete(
      {
        role: record.role,
        linkedAthleteIds: [],
        coachedAthleteIds: coached,
        scopeAllGroups: record.scopeAllGroups,
      },
      athleteId,
    );
  }

  /** Видна ли группа пользователю. */
  async checkGroup(userId: string, groupId: string): Promise<ScopeDecision> {
    const record = await this.requireUser(userId);

    const staffGroupIds =
      record.role === 'STAFF' ? await this.repository.listStaffGroupIds(userId) : [];

    return canAccessGroup(
      { role: record.role, scopeAllGroups: record.scopeAllGroups, staffGroupIds },
      groupId,
    );
  }

  /**
   * Бросает 403, если спортсмен вне scope.
   *
   * Скрывать существование ресурса не требуется: docs/23-api-contract-plan.md
   * требует лишь различать 401 и 403.
   */
  async assertAthleteAccess(userId: string, athleteId: string): Promise<void> {
    const decision = await this.checkAthlete(userId, athleteId);
    if (!decision.allowed) {
      this.logger.debug(
        `Отказ по scope к спортсмену (${decision.reason}): пользователь ${userId}`,
      );
      throw new ApiException('FORBIDDEN', 'Спортсмен вне зоны доступа');
    }
  }

  /** Бросает 403, если группа вне scope. */
  async assertGroupAccess(userId: string, groupId: string): Promise<void> {
    const decision = await this.checkGroup(userId, groupId);
    if (!decision.allowed) {
      this.logger.debug(`Отказ по scope к группе (${decision.reason}): пользователь ${userId}`);
      throw new ApiException('FORBIDDEN', 'Группа вне зоны доступа');
    }
  }

  /** Список видимых групп: пустой массив означает «все» (scopeAllGroups). */
  async visibleGroupIds(userId: string): Promise<string[] | null> {
    const record = await this.requireUser(userId);

    if (record.role === 'SUPERADMIN' || record.scopeAllGroups) {
      return null;
    }
    return this.repository.listStaffGroupIds(userId);
  }

  private async requireUser(userId: string): Promise<UserProfileRecord> {
    const record = await this.repository.findProfile(userId);
    if (!record) {
      throw new ApiException('NOT_FOUND' satisfies ApiErrorCode, 'Пользователь не найден');
    }
    if (record.status === 'BLOCKED') {
      throw new ApiException('USER_BLOCKED' satisfies ApiErrorCode, 'Учетная запись заблокирована');
    }
    return record;
  }
}
