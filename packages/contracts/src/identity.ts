/**
 * Контракт identity-профиля (ADR-0007).
 *
 * Здесь только транспортные типы: их читают backend, админка и мобильное
 * приложение. Логика доступа — в resolvePermissions и canAccessAthlete.
 */

import type { AthleteStatus, PermissionCode, UserRole, UserStatus } from './domain';
import { FINANCIAL_PERMISSION_CODES, ROLE_PERMISSIONS, UserRole as Roles } from './domain';

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

/**
 * Проверяет, попадает ли спортсмен в scope пользователя (ADR-0007, п.7).
 *
 * ВАЖНО: это только ресурсный scope. Наличие permission проверяется отдельно —
 * по docs/21-permission-matrix.md проверяются оба условия.
 */
export function canAccessAthlete(input: AthleteAccessInput, athleteId: string): boolean {
  if (input.role === Roles.SUPERADMIN) {
    return true;
  }

  if (input.role === Roles.MEMBER) {
    return input.linkedAthleteIds.includes(athleteId);
  }

  // STAFF
  if (input.scopeAllGroups) {
    return true;
  }
  return (input.coachedAthleteIds ?? []).includes(athleteId);
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
