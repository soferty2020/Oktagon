import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  type PermissionCode,
  type UserPermissionGrant,
  type UserPermissionsView,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { IdentityRepository } from './identity.repository';
import type { GrantRecord } from './identity.repository';
import { IdentityService } from './identity.service';

/**
 * Управление индивидуальными выдачами прав (issue B5).
 *
 * Спецификация: docs/04-roles-permissions.md, docs/21-permission-matrix.md,
 * ADR-0006. Выдачи только добавляют права поверх роли; отозвать право роли
 * нельзя — иначе роль перестала бы быть предсказуемой.
 *
 * Каждое изменение попадает в audit log (BR-007).
 */
@Injectable()
export class PermissionGrantService {
  private readonly logger = new Logger(PermissionGrantService.name);

  constructor(
    private readonly repository: IdentityRepository,
    private readonly identity: IdentityService,
    private readonly audit: AuditService,
  ) {}

  /** Состояние прав пользователя для админки. */
  async listForUser(userId: string): Promise<UserPermissionsView> {
    const profile = await this.identity.getProfile(userId);
    const record = await this.repository.findProfile(userId);
    const rolePermissions = await this.identity.getRolePermissions(userId);

    return {
      userId: profile.id,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      role: profile.role,
      scopeAllGroups: profile.scopeAllGroups,
      rolePermissions,
      grants: (record?.grants ?? []).map(toGrantView),
      effective: profile.permissions.codes,
    };
  }

  /**
   * Выдает право пользователю.
   *
   * Отклоняется, если код отсутствует в каталоге permissions или если право уже
   * гарантировано ролью: в этом случае личная выдача ничего не меняет и лишь
   * создает иллюзию, что доступ можно будет отозвать.
   */
  async grant(
    userId: string,
    code: string,
    grantedById: string,
    expiresAt?: Date | null,
  ): Promise<UserPermissionGrant> {
    await this.requireUser(userId);

    const catalogEntry = await this.repository.findPermissionByCode(code);
    if (!catalogEntry) {
      throw new ApiException(
        'PERMISSION_UNKNOWN' satisfies ApiErrorCode,
        `Право "${code}" отсутствует в каталоге`,
      );
    }

    const rolePermissions = await this.identity.getRolePermissions(userId);
    if (rolePermissions.includes(code as PermissionCode)) {
      throw new ApiException(
        'PERMISSION_GRANTED_BY_ROLE' satisfies ApiErrorCode,
        `Право "${code}" уже предоставлено ролью и не требует отдельной выдачи`,
      );
    }

    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new ApiException(
        'PERMISSION_EXPIRES_IN_PAST' satisfies ApiErrorCode,
        'Срок действия выдачи уже истек',
      );
    }

    // Выдача прав — не способ поднять себе доступ: нельзя выдать право себе и
    // нельзя выдать код, которого у выдающего нет (#50).
    if (userId === grantedById) {
      throw new ApiException(
        'FORBIDDEN' satisfies ApiErrorCode,
        'Нельзя выдать право самому себе',
      );
    }

    const actor = await this.identity.getProfile(grantedById);
    if (
      actor.role !== 'SUPERADMIN' &&
      !actor.permissions.codes.includes(code as PermissionCode)
    ) {
      throw new ApiException(
        'FORBIDDEN' satisfies ApiErrorCode,
        `Нельзя выдать право "${code}": у вас его нет`,
      );
    }

    const granted = await this.repository.grantPermission({
      userId,
      code,
      grantedById,
      expiresAt: expiresAt ?? null,
    });

    await this.audit.recordSafely({
      action: AuditAction.PERMISSION_GRANTED,
      entityType: AuditEntityType.USER_PERMISSION,
      entityId: userId,
      after: {
        code,
        isFinancial: granted.isFinancial,
        expiresAt: granted.expiresAt?.toISOString() ?? null,
      },
    });

    if (granted.isFinancial) {
      // Финансовые выдачи отмечаем отдельно: BR-010 требует явного контроля.
      this.logger.warn(`Выдано финансовое право ${code} пользователю ${userId}`);
    }

    return toGrantView(granted);
  }

  /**
   * Отзывает индивидуальную выдачу.
   *
   * Возвращает прежнего автора выдачи либо null, если выдачи не было: роутер
   * превращает это в 404.
   */
  async revoke(
    userId: string,
    code: string,
    revokedById: string,
  ): Promise<{ revoked: boolean; previousGrantedById: string | null }> {
    await this.requireUser(userId);

    const rolePermissions = await this.identity.getRolePermissions(userId);
    if (rolePermissions.includes(code as PermissionCode)) {
      throw new ApiException(
        'PERMISSION_IS_ROLE_BASED' satisfies ApiErrorCode,
        `Право "${code}" предоставлено ролью и не может быть отозвано индивидуально`,
      );
    }

    const removed = await this.repository.revokePermission({ userId, code });
    if (!removed) {
      throw new ApiException(
        'PERMISSION_NOT_GRANTED' satisfies ApiErrorCode,
        `Право "${code}" не выдавалось этому пользователю`,
      );
    }

    await this.audit.recordSafely({
      action: AuditAction.PERMISSION_REVOKED,
      entityType: AuditEntityType.USER_PERMISSION,
      entityId: userId,
      before: { code, grantedById: removed.grantedById },
      after: { revokedById },
    });

    return { revoked: true, previousGrantedById: removed.grantedById };
  }

  private async requireUser(userId: string): Promise<void> {
    // getProfile бросает NOT_FOUND или USER_BLOCKED; здесь важен сам факт.
    await this.identity.getProfile(userId);
  }
}

function toGrantView(grant: GrantRecord): UserPermissionGrant {
  return {
    code: grant.code as PermissionCode,
    description: grant.description,
    isFinancial: grant.isFinancial,
    grantedAt: grant.grantedAt.toISOString(),
    grantedById: grant.grantedById,
    expiresAt: grant.expiresAt?.toISOString() ?? null,
  };
}
