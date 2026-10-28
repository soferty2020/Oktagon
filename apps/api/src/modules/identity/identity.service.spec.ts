import { AuditAction, ApiErrorCode } from '@octagon/contracts';
import {
  UserRole as PrismaUserRole,
  UserStatus as PrismaUserStatus,
} from '../../../generated/prisma';
import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import type {
  IdentityRepository,
  LinkedAthleteRecord,
  UserProfileRecord,
} from './identity.repository';
import { IdentityService, toLinkedAthlete, toProfile } from './identity.service';

const baseRecord: UserProfileRecord = {
  id: 'user-1',
  email: 'parent@example.com',
  firstName: 'Айгуль',
  lastName: 'Серик',
  middleName: null,
  phone: '+7 700 000 00 00',
  role: PrismaUserRole.MEMBER,
  status: PrismaUserStatus.ACTIVE,
  scopeAllGroups: false,
  grants: [],
};

describe('toProfile', () => {
  it('не раскрывает приватные поля и отдает права роли', () => {
    const profile = toProfile({
      ...baseRecord,
      role: PrismaUserRole.STAFF,
      grants: [
        {
          code: 'payments.view',
          description: 'Просмотр оплат',
          isFinancial: true,
          grantedAt: new Date('2026-02-01T10:00:00.000Z'),
          grantedById: 'admin-1',
          expiresAt: null,
        },
      ],
    });

    expect(profile).toMatchObject({
      id: 'user-1',
      email: 'parent@example.com',
      role: 'STAFF',
      status: 'ACTIVE',
      scopeAllGroups: false,
    });
    // пароль, токены и внутренние идентификаторы не попадают в контракт
    expect(profile).not.toHaveProperty('passwordHash');
    expect(profile).not.toHaveProperty('grants');
    expect(profile.permissions.codes).toContain('attendance.view');
    expect(profile.permissions.codes).toContain('payments.view');
    expect(profile.permissions.grants).toEqual([
      { code: 'payments.view', grantedAt: '2026-02-01T10:00:00.000Z' },
    ]);
  });

  it('для MEMBER выдает права на чтение своих данных, но не на запись (ADR-0013)', () => {
    const profile = toProfile(baseRecord);

    // Матрица прав обещает родителю «own schedule» и «own attendance»: без этих
    // прав запрос отклонялся guard'ом до проверки scope (ADR-0013).
    // С #39 сюда добавились мероприятия своих детей: они тоже отфильтрованы scope,
    // а не правами, поэтому право одно на просмотр — без записи.
    expect(profile.permissions.codes).toEqual([
      'attendance.view',
      'attestations.view',
      'competitions.view',
      'groups.view',
      'schedule.view',
    ]);
    // Индивидуальных выдач нет: все права пришли от роли.
    expect(profile.permissions.grants).toEqual([]);
  });
});

describe('toLinkedAthlete', () => {
  it('сериализует дату рождения в календарную дату без времени', () => {
    const record: LinkedAthleteRecord = {
      athleteId: 'athlete-1',
      firstName: 'Али',
      lastName: 'Серик',
      middleName: 'Ерланович',
      birthDate: new Date('2015-09-01T00:00:00.000Z'),
      status: 'ACTIVE',
      beltGrade: 'WHITE',
      beltAwardedAt: null,
      rank: null,
      relation: 'PARENT',
      isPrimary: true,
    };

    expect(toLinkedAthlete(record)).toEqual({
      id: 'athlete-1',
      firstName: 'Али',
      lastName: 'Серик',
      middleName: 'Ерланович',
      birthDate: '2015-09-01',
      status: 'ACTIVE',
      beltGrade: 'WHITE',
      beltAwardedAt: null,
      rank: null,
      rankLabel: null,
      relation: 'PARENT',
      isPrimary: true,
    });
  });

  it('не включает заметки клуба', () => {
    const record: LinkedAthleteRecord = {
      athleteId: 'athlete-2',
      firstName: 'Али',
      lastName: 'Серик',
      middleName: null,
      birthDate: null,
      status: 'ACTIVE',
      beltGrade: 'WHITE',
      beltAwardedAt: null,
      rank: null,
      relation: 'SELF',
      isPrimary: false,
    };

    const athlete = toLinkedAthlete(record);
    expect(athlete).not.toHaveProperty('notes');
    expect(athlete.birthDate).toBeNull();
  });
});

describe('IdentityService', () => {
  let repository: jest.Mocked<IdentityRepository>;
  let audit: { recordSafely: jest.Mock };
  let service: IdentityService;

  beforeEach(() => {
    repository = {
      findProfile: jest.fn(),
      listLinkedAthletes: jest.fn(),
      listCoachedAthleteIds: jest.fn(),
      setStatus: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IdentityRepository>;
    audit = { recordSafely: jest.fn().mockResolvedValue(null) };
    service = new IdentityService(repository, audit as unknown as AuditService);
  });

  describe('блокировка аккаунта (#56)', () => {
    it('блокирует сотрудника и пишет аудит', async () => {
      repository.findProfile.mockResolvedValue({ ...baseRecord, role: 'STAFF' });

      await service.setUserStatus('admin-1', 'user-1', 'BLOCKED');

      expect(repository.setStatus).toHaveBeenCalledWith('user-1', 'BLOCKED');
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.blocked', entityId: 'user-1' }),
      );
    });

    it('не даёт заблокировать себя', async () => {
      await expect(service.setUserStatus('user-1', 'user-1', 'BLOCKED')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });

      expect(repository.setStatus).not.toHaveBeenCalled();
    });

    it('не даёт заблокировать администратора клуба', async () => {
      repository.findProfile.mockResolvedValue({ ...baseRecord, role: 'SUPERADMIN' });

      await expect(service.setUserStatus('admin-2', 'user-1', 'BLOCKED')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });

      expect(repository.setStatus).not.toHaveBeenCalled();
    });

    it('разблокирует заблокированного: профиль читается в обход проверки статуса', async () => {
      repository.findProfile.mockResolvedValue({
        ...baseRecord,
        status: PrismaUserStatus.BLOCKED,
      });

      await service.setUserStatus('admin-1', 'user-1', 'ACTIVE');

      expect(repository.setStatus).toHaveBeenCalledWith('user-1', 'ACTIVE');
    });
  });

  it('отдает профиль по идентификатору пользователя', async () => {
    repository.findProfile.mockResolvedValue(baseRecord);

    const profile = await service.getProfile('user-1');

    expect(profile.id).toBe('user-1');
    expect(repository.findProfile).toHaveBeenCalledWith('user-1');
  });

  it('отдает 404, если пользователь не найден или архивирован', async () => {
    repository.findProfile.mockResolvedValue(null);

    await expect(service.getProfile('missing')).rejects.toBeInstanceOf(ApiException);
    await expect(service.getProfile('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND' satisfies ApiErrorCode,
    });
  });

  it('отдает 403 для заблокированного пользователя', async () => {
    repository.findProfile.mockResolvedValue({ ...baseRecord, status: PrismaUserStatus.BLOCKED });

    await expect(service.getProfile('user-1')).rejects.toMatchObject({ code: 'USER_BLOCKED' });
  });

  it('возвращает связанных спортсменов и фиксирует обращение в аудите', async () => {
    repository.listLinkedAthletes.mockResolvedValue([
      {
        athleteId: 'athlete-1',
        firstName: 'Али',
        lastName: 'Серик',
        middleName: null,
        birthDate: null,
        status: 'ACTIVE',
        beltGrade: 'WHITE',
        beltAwardedAt: null,
        rank: null,
        relation: 'PARENT',
        isPrimary: true,
      },
    ]);

    const athletes = await service.listLinkedAthletes('user-1');

    expect(athletes).toHaveLength(1);
    expect(audit.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ATHLETE_LINKS_VIEWED,
        entityId: 'user-1',
      }),
    );
  });

  it('не пишет аудит, если связанных спортсменов нет', async () => {
    repository.listLinkedAthletes.mockResolvedValue([]);

    await service.listLinkedAthletes('user-1');

    expect(audit.recordSafely).not.toHaveBeenCalled();
  });

  it('MEMBER получает доступ только к своим спортсменам', async () => {
    repository.findProfile.mockResolvedValue(baseRecord);
    repository.listLinkedAthletes.mockResolvedValue([
      {
        athleteId: 'athlete-1',
        firstName: 'Али',
        lastName: 'Серик',
        middleName: null,
        birthDate: null,
        status: 'ACTIVE',
        beltGrade: 'WHITE',
        beltAwardedAt: null,
        rank: null,
        relation: 'PARENT',
        isPrimary: true,
      },
    ]);

    await expect(service.canAccessAthlete('user-1', 'athlete-1')).resolves.toEqual({
      allowed: true,
      reason: 'linked_member',
    });
    await expect(service.canAccessAthlete('user-1', 'athlete-2')).resolves.toEqual({
      allowed: false,
      reason: 'denied_no_relation',
    });
  });

  it('STAFF без scopeAllGroups получает доступ только к спортсменам своих групп', async () => {
    repository.findProfile.mockResolvedValue({
      ...baseRecord,
      role: PrismaUserRole.STAFF,
      scopeAllGroups: false,
    });
    repository.listCoachedAthleteIds.mockResolvedValue(['athlete-1']);

    await expect(service.canAccessAthlete('user-1', 'athlete-1')).resolves.toEqual({
      allowed: true,
      reason: 'staff_coached_group',
    });
    await expect(service.canAccessAthlete('user-1', 'athlete-9')).resolves.toEqual({
      allowed: false,
      reason: 'denied_out_of_scope',
    });
  });

  it('STAFF с scopeAllGroups получает доступ ко всем спортсменам', async () => {
    repository.findProfile.mockResolvedValue({
      ...baseRecord,
      role: PrismaUserRole.STAFF,
      scopeAllGroups: true,
    });
    repository.listCoachedAthleteIds.mockResolvedValue([]);

    await expect(service.canAccessAthlete('user-1', 'athlete-9')).resolves.toEqual({
      allowed: true,
      reason: 'staff_all_groups',
    });
  });

  it('SUPERADMIN получает доступ к любому спортсмену без запросов к группам', async () => {
    repository.findProfile.mockResolvedValue({
      ...baseRecord,
      role: PrismaUserRole.SUPERADMIN,
      scopeAllGroups: true,
    });

    await expect(service.canAccessAthlete('user-1', 'athlete-9')).resolves.toEqual({
      allowed: true,
      reason: 'role_superadmin',
    });
    expect(repository.listCoachedAthleteIds).not.toHaveBeenCalled();
  });
});
