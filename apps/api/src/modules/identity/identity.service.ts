import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type LinkedAthlete,
  type ListUsersQuery,
  type PaginatedUsers,
  type PermissionCode,
  type ScopeDecision,
  type UserPermissions,
  type UserProfile,
  type UserView,
  canAccessAthlete,
  rankLabel,
  resolvePermissions,
} from '@octagon/contracts';

import { UserStatus } from '../../../generated/prisma';
import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
// Обычный импорт, не `import type`: IdentityRepository — DI-токен, его значение
// должно попасть в метаданные конструктора (emitDecoratorMetadata).
import { IdentityRepository } from './identity.repository';
import type { LinkedAthleteRecord, UserListRecord, UserProfileRecord } from './identity.repository';

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

  /**
   * Роль пользователя для проверок по роли (SuperadminGuard).
   *
   * Читается из базы, а не из токена: снятие роли должно действовать сразу.
   */
  async getRole(userId: string): Promise<string> {
    const record = await this.requireProfile(userId);
    return record.role;
  }

  /** Базовый набор прав роли, без индивидуальных выдач. */
  async getRolePermissions(userId: string): Promise<PermissionCode[]> {
    const record = await this.requireProfile(userId);
    return resolvePermissions({ role: record.role, grants: [] }).codes;
  }

  /**
   * Список пользователей для админки.
   *
   * Нужен, чтобы выдать индивидуальное право или связать аккаунт со
   * спортсменом: без него выбирать аккаунт не из чего. Доступ ограничен правом
   * `users.manage` — отдельного права на просмотр в каталоге нет
   * (docs/04-roles-permissions.md).
   */
  async listUsers(query: ListUsersQuery): Promise<PaginatedUsers> {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    const { items, total } = await this.repository.listUsers({
      role: query.role,
      status: query.status,
      search: query.search,
      skip: (page - 1) * perPage,
      take: perPage,
    });

    return {
      items: items.map(toUserView),
      meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
    };
  }

  /**
   * Блокировка и разблокировка аккаунта (#56, SEC-15).
   *
   * Заблокированный сотрудник теряет доступ: `requireProfile` отказывает ему на
   * любом маршруте, а сессии отзываются вызывающим кодом (auth-модуль).
   * Себя и SUPERADMIN блокировать нельзя — иначе клуб останется без управления.
   */
  async setUserStatus(
    callerUserId: string,
    userId: string,
    status: 'ACTIVE' | 'BLOCKED',
  ): Promise<void> {
    if (callerUserId === userId && status === 'BLOCKED') {
      throw new ApiException(
        'FORBIDDEN' satisfies ApiErrorCode,
        'Нельзя заблокировать собственный аккаунт',
      );
    }

    // findProfile, а не requireProfile: заблокированный аккаунт нужно уметь
    // разблокировать, а requireProfile на нём бросает USER_BLOCKED.
    const record = await this.repository.findProfile(userId);
    if (!record) {
      throw new ApiException('NOT_FOUND' satisfies ApiErrorCode, 'Пользователь не найден');
    }

    if (record.role === 'SUPERADMIN' && status === 'BLOCKED') {
      throw new ApiException(
        'FORBIDDEN' satisfies ApiErrorCode,
        'Администратора клуба заблокировать нельзя',
      );
    }

    if (record.status === status) {
      return;
    }

    await this.repository.setStatus(userId, status as UserStatus);

    await this.audit.recordSafely({
      action: status === 'BLOCKED' ? AuditAction.USER_BLOCKED : AuditAction.USER_UNBLOCKED,
      entityType: AuditEntityType.USER,
      entityId: userId,
      before: { status: record.status },
      after: { status },
    });
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
    beltGrade: record.beltGrade,
    beltAwardedAt: record.beltAwardedAt
      ? record.beltAwardedAt.toISOString().slice(0, 10)
      : null,
    rank: record.rank,
    rankLabel: rankLabel(record.rank),
    relation: record.relation,
    isPrimary: record.isPrimary,
  };
}

/** Пользователь для списка админки: без прав и приватных полей. */
export function toUserView(record: UserListRecord): UserView {  return {
    id: record.id,
    email: record.email,
    firstName: record.firstName,
    lastName: record.lastName,
    middleName: record.middleName,
    phone: record.phone,
    role: record.role,
    status: record.status,
    scopeAllGroups: record.scopeAllGroups,
    createdAt: record.createdAt.toISOString(),
  };
}
