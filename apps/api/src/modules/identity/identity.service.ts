import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  type LinkedAthlete,
  type PermissionCode,
  type ScopeDecision,
  type UserPermissions,
  type UserProfile,
  canAccessAthlete,
  resolvePermissions,
} from '@octagon/contracts';

import { UserStatus } from '../../../generated/prisma';
import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
// Обычный импорт, не `import type`: IdentityRepository — DI-токен, его значение
// должно попасть в метаданные конструктора (emitDecoratorMetadata).
import { IdentityRepository } from './identity.repository';
import type { LinkedAthleteRecord, UserProfileRecord } from './identity.repository';

/**
 * Слой identity (issue B1).
 *
 * Отвечает за профиль аутентифицированного пользователя и его эффективные
 * права. Приватные поля БД (пароль, токены, внутренние связи) за пределы модуля
 * не выходят — ADR-0007.
 */
@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    private readonly repository: IdentityRepository,
    private readonly audit: AuditService,
  ) {}

  /** Профиль пользователя для `GET /me`. */
  async getProfile(userId: string): Promise<UserProfile> {
    const record = await this.requireProfile(userId);
    return toProfile(record);
  }

  /**
   * Эффективные права пользователя.
   *
   * Используется PermissionsGuard: права вычисляются на каждом запросе
   * (ADR-0006), а не читаются из токена.
   */
  async getPermissions(userId: string): Promise<UserPermissions> {
    const record = await this.requireProfile(userId);
    return toProfile(record).permissions;
  }

  /** Базовый набор прав роли, без индивидуальных выдач. */
  async getRolePermissions(userId: string): Promise<PermissionCode[]> {
    const record = await this.requireProfile(userId);
    return resolvePermissions({ role: record.role, grants: [] }).codes;
  }

  /**
   * Связанные спортсмены для `GET /me/athletes`.
   *
   * По docs/00-project-overview.md аккаунт не равен карточке спортсмена, поэтому
   * клиенту нужен список для переключателя; профиль его не содержит (ADR-0007).
   */
  async listLinkedAthletes(userId: string): Promise<LinkedAthlete[]> {
    const athletes = await this.repository.listLinkedAthletes(userId);

    if (athletes.length > 0) {
      // Обращение к связям фиксируем отдельным действием: это чтение, а не
      // изменение, поэтому не athlete.account_linked (BR-007).
      await this.audit.recordSafely({
        action: AuditAction.ATHLETE_LINKS_VIEWED,
        entityType: AuditEntityType.USER_ATHLETE,
        entityId: userId,
        after: { athletes: athletes.map((athlete) => athlete.athleteId) },
      });
    }

    return athletes.map(toLinkedAthlete);
  }

  /**
   * Проверяет ресурсный scope: попадает ли спортсмен в зону видимости
   * пользователя (ADR-0007, п.7).
   *
   * Наличие permission проверяется отдельно: по docs/21-permission-matrix.md
   * нужны оба условия.
   */
  async canAccessAthlete(userId: string, athleteId: string): Promise<ScopeDecision> {
    const record = await this.requireProfile(userId);

    if (record.role === 'MEMBER') {
      const linked = await this.repository.listLinkedAthletes(userId);
      return canAccessAthlete(
        { role: record.role, linkedAthleteIds: linked.map((athlete) => athlete.athleteId) },
        athleteId,
      );
    }

    const coached =
      record.role === 'STAFF' ? await this.repository.listCoachedAthleteIds(userId) : [];

    const decision = canAccessAthlete(
      {
        role: record.role,
        linkedAthleteIds: [],
        coachedAthleteIds: coached,
        scopeAllGroups: record.scopeAllGroups,
      },
      athleteId,
    );

    if (!decision.allowed) {
      // Отказ в доступе фиксируем в логах: персональные данные не пишем.
      this.logger.debug(
        `Доступ к спортсмену отклонен по scope (${decision.reason}): пользователь ${userId}`,
      );
    }

    return decision;
  }

  private async requireProfile(userId: string): Promise<UserProfileRecord> {
    const record = await this.repository.findProfile(userId);

    if (!record) {
      throw new ApiException('NOT_FOUND' satisfies ApiErrorCode, 'Пользователь не найден');
    }
    if (record.status === UserStatus.BLOCKED) {
      throw new ApiException('USER_BLOCKED' satisfies ApiErrorCode, 'Учетная запись заблокирована');
    }

    return record;
  }
}

/** Преобразует запись БД в контракт профиля (ADR-0007). */
export function toProfile(record: UserProfileRecord): UserProfile {
  const permissions = resolvePermissions({
    role: record.role,
    grants: record.grants.map((grant) => ({
      code: grant.code as PermissionCode,
      grantedAt: grant.grantedAt.toISOString(),
    })),
  });

  return {
    id: record.id,
    email: record.email,
    firstName: record.firstName,
    lastName: record.lastName,
    middleName: record.middleName,
    phone: record.phone,
    role: record.role,
    status: record.status,
    scopeAllGroups: record.scopeAllGroups,
    permissions,
  };
}

/** `notes` клуба родителю не отдаются (docs/15-security.md, Privacy). */
export function toLinkedAthlete(record: LinkedAthleteRecord): LinkedAthlete {
  return {
    id: record.athleteId,
    firstName: record.firstName,
    lastName: record.lastName,
    middleName: record.middleName,
    birthDate: record.birthDate ? record.birthDate.toISOString().slice(0, 10) : null,
    status: record.status,
    relation: record.relation,
    isPrimary: record.isPrimary,
  };
}
