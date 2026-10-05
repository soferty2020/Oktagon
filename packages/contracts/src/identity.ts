/**
 * Контракт identity-профиля (ADR-0007).
 *
 * Здесь только транспортные типы: их читают backend, админка и мобильное
 * приложение. Логика доступа — в resolvePermissions и canAccessAthlete.
 */

import type { AthleteStatus, PermissionCode, UserRole, UserStatus } from './domain';
import {
  FINANCIAL_PERMISSION_CODES,
  PERMISSION_CODES,
  ROLE_PERMISSIONS,
  UserRole as Roles,
} from './domain';

/** Индивидуально выданное право (в отличие от права, пришедшего от роли). */
export interface PermissionGrant {
  code: PermissionCode;
  grantedAt: string;
}

/** Права пользователя: итоговый набор плюс индивидуальные выдачи. */
export interface UserPermissions {
  /** Полный набор прав: базовый набор роли ∪ индивидуальные выдачи. */
  codes: PermissionCode[];
  /** Только выданные лично права — нужны админке для отзыва. */
  grants: PermissionGrant[];
}

/** `GET /api/v1/me` — кто я и что мне разрешено. */
export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  /** true — сотрудник видит все группы, а не только свои (ADR-0006). */
  scopeAllGroups: boolean;
  permissions: UserPermissions;
}

/**
 * Карточка спортсмена в списке связанных (`GET /api/v1/me/athletes`).
 *
 * `notes` сюда не входит: заметки клуба не предназначены родителю.
 */
export interface LinkedAthlete {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  birthDate: string | null;
  status: AthleteStatus;
  /** Связь с аккаунтом: SELF, PARENT, GUARDIAN. */
  relation: string;
  isPrimary: boolean;
}

/** Вход для resolvePermissions. */
export interface PermissionInput {
  role: UserRole;
  /** Индивидуальные выдачи. */
  grants: readonly PermissionGrant[];
}

/** Проверка права: принимает и литерал каталога, и пришедшую извне строку. */
export function isPermissionCode(value: string): boolean {
  return PERMISSION_CODES.includes(value as PermissionCode);
}

/**
 * Вычисляет эффективные права: базовый набор роли плюс индивидуальные выдачи.
 *
 * Чистая функция без зависимостей от NestJS и Prisma (ADR-0007): используется
 * backend-проверками, тестами границ доступа и, при необходимости, UI.
 */
export function resolvePermissions(input: PermissionInput): UserPermissions {
  const rolePermissions = ROLE_PERMISSIONS[input.role] ?? [];
  const codes = new Set<PermissionCode>(rolePermissions);

  for (const grant of input.grants) {
    codes.add(grant.code);
  }

  return {
    codes: [...codes].sort(),
    grants: [...input.grants].sort((left, right) => left.code.localeCompare(right.code)),
  };
}

/** Вход для проверки доступа к карточке спортсмена. */
export interface AthleteAccessInput {
  role: UserRole;
  /** Связи аккаунта со спортсменами (UserAthlete). */
  linkedAthleteIds: readonly string[];
  /** Группы спортсмена, которые ведет сотрудник. */
  coachedAthleteIds?: readonly string[];
  scopeAllGroups?: boolean;
}

/** Почему доступ разрешен или запрещен — нужно для логов и тестов. */
export type ScopeReason =
  | 'role_superadmin'
  | 'linked_member'
  | 'staff_all_groups'
  | 'staff_coached_group'
  | 'denied_no_relation'
  | 'denied_out_of_scope';

/** Результат проверки ресурсного scope (docs/21-permission-matrix.md). */
export interface ScopeDecision {
  allowed: boolean;
  reason: ScopeReason;
}

/**
 * Проверяет, попадает ли спортсмен в scope пользователя (ADR-0007, п.7).
 *
 * ВАЖНО: это только ресурсный scope. Наличие permission проверяется отдельно —
 * по docs/21-permission-matrix.md проверяются оба условия.
 */
export function canAccessAthlete(input: AthleteAccessInput, athleteId: string): ScopeDecision {
  if (input.role === Roles.SUPERADMIN) {
    return { allowed: true, reason: 'role_superadmin' };
  }

  if (input.role === Roles.MEMBER) {
    return input.linkedAthleteIds.includes(athleteId)
      ? { allowed: true, reason: 'linked_member' }
      : { allowed: false, reason: 'denied_no_relation' };
  }

  // STAFF
  if (input.scopeAllGroups) {
    return { allowed: true, reason: 'staff_all_groups' };
  }
  return (input.coachedAthleteIds ?? []).includes(athleteId)
    ? { allowed: true, reason: 'staff_coached_group' }
    : { allowed: false, reason: 'denied_out_of_scope' };
}

/**
 * Проверяет, видит ли сотрудник группу.
 *
 * В MVP scope описывается флагом `scopeAllGroups` и списком групп тренера
 * (ADR-0006); отдельного scope по филиалам нет.
 */
export function canAccessGroup(
  input: { role: UserRole; scopeAllGroups?: boolean; staffGroupIds?: readonly string[] },
  groupId: string,
): ScopeDecision {
  if (input.role === Roles.SUPERADMIN) {
    return { allowed: true, reason: 'role_superadmin' };
  }
  if (input.scopeAllGroups) {
    return { allowed: true, reason: 'staff_all_groups' };
  }
  return (input.staffGroupIds ?? []).includes(groupId)
    ? { allowed: true, reason: 'staff_coached_group' }
    : { allowed: false, reason: 'denied_out_of_scope' };
}

/** Проверяет, входит ли право в эффективный набор. */
export function hasPermission(
  permissions: UserPermissions,
  required: PermissionCode,
): boolean {
  return permissions.codes.includes(required);
}

/** Проверяет, относится ли право к финансовым (BR-010). */
export function isFinancialPermission(code: PermissionCode): boolean {
  return FINANCIAL_PERMISSION_CODES.includes(code);
}

// ---------------------------------------------------------------------------
// Управление индивидуальными выдачами (docs/04-roles-permissions.md)
// ---------------------------------------------------------------------------

/** Одна индивидуальная выдача права. */
export interface UserPermissionGrant {
  code: PermissionCode;
  description: string;
  /** Финансовое право — особо защищенное (BR-010). */
  isFinancial: boolean;
  grantedAt: string;
  /** Кто выдал; null, если автор записи недоступен. */
  grantedById: string | null;
  /** Срок действия; null — бессрочно. Истекшая выдача не действует. */
  expiresAt: string | null;
}

/** `GET /api/v1/users/{id}/permissions`. */
export interface UserPermissionsView {
  userId: string;
  /**
   * Кто это. Нужно админке: экран прав открывается по идентификатору, а
   * отдельного `GET /users/{id}` в контракте нет.
   */
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  scopeAllGroups: boolean;
  /** Права, которые дает роль (ADR-0006). */
  rolePermissions: PermissionCode[];
  /** Права, выданные лично. */
  grants: UserPermissionGrant[];
  /** Итоговый набор: роль плюс действующие выдачи. */
  effective: PermissionCode[];
}

/** `POST /api/v1/users/{id}/permissions`. */
export interface GrantPermissionInput {
  code: PermissionCode;
  /** ISO-8601; не задан — бессрочно. */
  expiresAt?: string | null;
}

/** Причины отказа в управлении выдачами. */
export const PermissionGrantIssue = {
  UNKNOWN_CODE: 'UNKNOWN_CODE',
  /** Право уже гарантировано ролью: выдавать его лично не нужно. */
  GRANTED_BY_ROLE: 'GRANTED_BY_ROLE',
  /** Право отозвать нельзя: оно пришло от роли (ADR-0006). */
  ROLE_PERMISSION: 'ROLE_PERMISSION',
  EXPIRES_IN_PAST: 'EXPIRES_IN_PAST',
  NOT_GRANTED: 'NOT_GRANTED',
} as const;
export type PermissionGrantIssue =
  (typeof PermissionGrantIssue)[keyof typeof PermissionGrantIssue];
