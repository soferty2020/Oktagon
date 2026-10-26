import { PermissionCode, UserRole } from './domain';
import {
  type PermissionGrant,
  canAccessAthlete,
  hasPermission,
  isFinancialPermission,
  resolvePermissions,
} from './identity';

describe('resolvePermissions', () => {
  it('выдает полный набор прав суперадмину', () => {
    const permissions = resolvePermissions({ role: UserRole.SUPERADMIN, grants: [] });

    expect(permissions.codes).toContain(PermissionCode.UsersManage);
    expect(permissions.codes).toContain(PermissionCode.PaymentsEdit);
  });

  it('выдает MEMBER права на чтение своих данных, но не на запись (ADR-0013)', () => {
    // docs/21-permission-matrix.md: «own schedule», «own attendance» — это
    // возможности со scope. Без этих прав запрос отклонялся guard'ом до
    // проверки scope, и родитель не видел расписание ребенка.
    const permissions = resolvePermissions({ role: UserRole.MEMBER, grants: [] });

    expect(permissions.codes).toEqual([
      PermissionCode.AttendanceView,
      // Мероприятия своих детей (#39): тоже scope, а не отдельное право на каждое
      // событие. Самостоятельной записи у родителя нет — это правило API.
      PermissionCode.AttestationsView,
      PermissionCode.CompetitionsView,
      PermissionCode.GroupsView,
      PermissionCode.ScheduleView,
    ]);
  });

  it('не выдает MEMBER прав на запись, финансов и контактов (ADR-0013)', () => {
    const permissions = resolvePermissions({ role: UserRole.MEMBER, grants: [] });

    // Родитель не отмечает посещаемость, не переносит занятия и не видит
    // финансы: payments.view открыл бы суммы по всей школе.
    expect(permissions.codes).not.toContain(PermissionCode.AttendanceEdit);
    expect(permissions.codes).not.toContain(PermissionCode.ScheduleEdit);
    expect(permissions.codes).not.toContain(PermissionCode.ScheduleCancel);
    expect(permissions.codes).not.toContain(PermissionCode.PaymentsView);
    expect(permissions.codes).not.toContain(PermissionCode.AthletesContactsView);
    expect(permissions.codes).not.toContain(PermissionCode.AnalyticsView);
  });

  it('не выдает STAFF финансовые права по умолчанию (BR-010)', () => {
    const permissions = resolvePermissions({ role: UserRole.STAFF, grants: [] });

    expect(permissions.codes).not.toContain(PermissionCode.PaymentsView);
    expect(permissions.codes).not.toContain(PermissionCode.FreezesEdit);
    expect(permissions.codes).toContain(PermissionCode.AttendanceEdit);
  });

  it('добавляет индивидуальные выдачи поверх роли', () => {
    const grants: PermissionGrant[] = [
      { code: PermissionCode.PaymentsView, grantedAt: '2026-02-01T10:00:00.000Z' },
    ];

    const permissions = resolvePermissions({ role: UserRole.STAFF, grants });

    expect(permissions.codes).toContain(PermissionCode.PaymentsView);
    expect(permissions.codes).toContain(PermissionCode.AttendanceEdit);
    expect(permissions.grants).toEqual(grants);
  });

  it('не дублирует право, если оно уже есть у роли', () => {
    const grants: PermissionGrant[] = [
      { code: PermissionCode.AttendanceView, grantedAt: '2026-02-01T10:00:00.000Z' },
    ];

    const permissions = resolvePermissions({ role: UserRole.STAFF, grants });

    const occurrences = permissions.codes.filter((code) => code === PermissionCode.AttendanceView);
    expect(occurrences).toHaveLength(1);
  });
});

describe('canAccessAthlete', () => {
  const athleteId = 'athlete-1';

  // Решение возвращается с причиной (слой B5/B6, ADR-0007): причину видно в
  // логах и проверяют тесты, поэтому проверяется и allowed, и reason.
  it('суперадмин имеет доступ к любому спортсмену', () => {
    expect(
      canAccessAthlete({ role: UserRole.SUPERADMIN, linkedAthleteIds: [] }, athleteId),
    ).toEqual({ allowed: true, reason: 'role_superadmin' });
  });

  it('родитель имеет доступ только к связанным спортсменам', () => {
    expect(
      canAccessAthlete({ role: UserRole.MEMBER, linkedAthleteIds: [athleteId] }, athleteId),
    ).toEqual({ allowed: true, reason: 'linked_member' });
    expect(
      canAccessAthlete({ role: UserRole.MEMBER, linkedAthleteIds: ['athlete-2'] }, athleteId),
    ).toEqual({ allowed: false, reason: 'denied_no_relation' });
  });

  it('тренер без расширенного scope видит только своих спортсменов', () => {
    expect(
      canAccessAthlete(
        { role: UserRole.STAFF, linkedAthleteIds: [], coachedAthleteIds: [athleteId] },
        athleteId,
      ),
    ).toEqual({ allowed: true, reason: 'staff_coached_group' });
    expect(
      canAccessAthlete(
        { role: UserRole.STAFF, linkedAthleteIds: [], coachedAthleteIds: [] },
        athleteId,
      ),
    ).toEqual({ allowed: false, reason: 'denied_out_of_scope' });
  });

  it('тренер с scopeAllGroups видит всех', () => {
    expect(
      canAccessAthlete(
        { role: UserRole.STAFF, linkedAthleteIds: [], scopeAllGroups: true },
        athleteId,
      ),
    ).toEqual({ allowed: true, reason: 'staff_all_groups' });
  });
});

describe('hasPermission', () => {
  it('различает наличие и отсутствие права', () => {
    const permissions = resolvePermissions({ role: UserRole.MEMBER, grants: [] });

    expect(hasPermission(permissions, PermissionCode.ChatUse)).toBe(false);
    expect(
      hasPermission(
        resolvePermissions({ role: UserRole.STAFF, grants: [] }),
        PermissionCode.AttendanceView,
      ),
    ).toBe(true);
  });
});

describe('isFinancialPermission', () => {
  it('относит к финансовым только payments.* и freezes.* (BR-010)', () => {
    expect(isFinancialPermission(PermissionCode.PaymentsView)).toBe(true);
    expect(isFinancialPermission(PermissionCode.FreezesEdit)).toBe(true);
    expect(isFinancialPermission(PermissionCode.AttendanceView)).toBe(false);
  });
});
