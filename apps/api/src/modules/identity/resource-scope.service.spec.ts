import { UserRole } from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import type { IdentityRepository, UserProfileRecord } from './identity.repository';
import { ResourceScopeService } from './resource-scope.service';

const superadmin: UserProfileRecord = {
  id: 'admin-1',
  email: 'admin@example.com',
  firstName: 'Super',
  lastName: 'Admin',
  middleName: null,
  phone: null,
  role: UserRole.SUPERADMIN,
  status: 'ACTIVE',
  scopeAllGroups: true,
  grants: [],
};

const member: UserProfileRecord = {
  ...superadmin,
  id: 'parent-1',
  role: UserRole.MEMBER,
  scopeAllGroups: false,
};

const coach: UserProfileRecord = {
  ...superadmin,
  id: 'coach-1',
  role: UserRole.STAFF,
  scopeAllGroups: false,
};

describe('ResourceScopeService', () => {
  let repository: jest.Mocked<IdentityRepository>;
  let service: ResourceScopeService;

  beforeEach(() => {
    repository = {
      findProfile: jest.fn().mockResolvedValue(coach),
      listLinkedAthletes: jest.fn().mockResolvedValue([]),
      listCoachedAthleteIds: jest.fn().mockResolvedValue([]),
      listStaffGroupIds: jest.fn().mockResolvedValue([]),
      findPermissionByCode: jest.fn(),
      grantPermission: jest.fn(),
      revokePermission: jest.fn(),
    } as unknown as jest.Mocked<IdentityRepository>;

    service = new ResourceScopeService(repository);
  });

  describe('checkAthlete', () => {
    it('суперадмин видит любого спортсмена', async () => {
      repository.findProfile.mockResolvedValue(superadmin);

      await expect(service.checkAthlete('admin-1', 'athlete-9')).resolves.toEqual({
        allowed: true,
        reason: 'role_superadmin',
      });
    });

    it('родитель видит только связанных спортсменов', async () => {
      repository.findProfile.mockResolvedValue(member);
      repository.listLinkedAthletes.mockResolvedValue([
        {
          athleteId: 'athlete-1',
          firstName: 'Али',
          lastName: 'Серик',
          middleName: null,
          birthDate: null,
          status: 'ACTIVE',
          beltGrade: null,
          beltAwardedAt: null,
          relation: 'PARENT',
          isPrimary: true,
        },
      ]);

      await expect(service.checkAthlete('parent-1', 'athlete-1')).resolves.toMatchObject({
        allowed: true,
      });
      await expect(service.checkAthlete('parent-1', 'athlete-2')).resolves.toEqual({
        allowed: false,
        reason: 'denied_no_relation',
      });
    });

    it('тренер видит только спортсменов своих групп (docs/21, Enforcement)', async () => {
      repository.listCoachedAthleteIds.mockResolvedValue(['athlete-1']);

      await expect(service.checkAthlete('coach-1', 'athlete-1')).resolves.toMatchObject({
        allowed: true,
        reason: 'staff_coached_group',
      });
      await expect(service.checkAthlete('coach-1', 'athlete-9')).resolves.toMatchObject({
        allowed: false,
        reason: 'denied_out_of_scope',
      });
    });

    it('тренер с scopeAllGroups видит всех', async () => {
      repository.findProfile.mockResolvedValue({ ...coach, scopeAllGroups: true });

      await expect(service.checkAthlete('coach-1', 'athlete-9')).resolves.toMatchObject({
        allowed: true,
        reason: 'staff_all_groups',
      });
    });
  });

  describe('checkGroup и видимость', () => {
    it('тренер видит только свои группы', async () => {
      repository.listStaffGroupIds.mockResolvedValue(['group-1']);

      await expect(service.checkGroup('coach-1', 'group-1')).resolves.toMatchObject({
        allowed: true,
        reason: 'staff_coached_group',
      });
      await expect(service.checkGroup('coach-1', 'group-2')).resolves.toMatchObject({
        allowed: false,
        reason: 'denied_out_of_scope',
      });
    });

    it('visibleGroupIds возвращает null, когда scope не ограничен', async () => {
      repository.findProfile.mockResolvedValue(superadmin);

      await expect(service.visibleGroupIds('admin-1')).resolves.toBeNull();
    });

    it('visibleGroupIds возвращает список групп тренера', async () => {
      repository.listStaffGroupIds.mockResolvedValue(['group-1', 'group-2']);

      await expect(service.visibleGroupIds('coach-1')).resolves.toEqual(['group-1', 'group-2']);
    });
  });

  describe('assert-методы', () => {
    it('бросает 403, когда спортсмен вне scope', async () => {
      repository.listCoachedAthleteIds.mockResolvedValue([]);

      await expect(service.assertAthleteAccess('coach-1', 'athlete-9')).rejects.toBeInstanceOf(
        ApiException,
      );
      await expect(service.assertAthleteAccess('coach-1', 'athlete-9')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('не бросает, когда доступ есть', async () => {
      repository.listStaffGroupIds.mockResolvedValue(['group-1']);

      await expect(service.assertGroupAccess('coach-1', 'group-1')).resolves.toBeUndefined();
    });

    it('бросает 403, когда группа вне scope', async () => {
      repository.listStaffGroupIds.mockResolvedValue([]);

      await expect(service.assertGroupAccess('coach-1', 'group-9')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  it('не дает доступа несуществующему пользователю', async () => {
    repository.findProfile.mockResolvedValue(null);

    await expect(service.checkAthlete('ghost', 'athlete-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
