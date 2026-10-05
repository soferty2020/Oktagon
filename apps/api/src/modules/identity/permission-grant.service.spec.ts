import { PermissionCode, UserRole } from '@octagon/contracts';

import { AuditService } from '../audit/audit.service';
import type { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';
import type { UserProfileRecord } from './identity.repository';
import { PermissionGrantService } from './permission-grant.service';

const staffProfile: UserProfileRecord = {
  id: 'user-1',
  email: 'coach@example.com',
  firstName: 'Алия',
  lastName: 'Нурлан',
  middleName: null,
  phone: null,
  role: UserRole.STAFF,
  status: 'ACTIVE',
  scopeAllGroups: false,
  grants: [],
};

describe('PermissionGrantService', () => {
  let repository: jest.Mocked<IdentityRepository>;
  let identity: { getProfile: jest.Mock; getRolePermissions: jest.Mock };
  let audit: { recordSafely: jest.Mock };
  let service: PermissionGrantService;

  beforeEach(() => {
    repository = {
      findProfile: jest.fn().mockResolvedValue(staffProfile),
      listLinkedAthletes: jest.fn().mockResolvedValue([]),
      listCoachedAthleteIds: jest.fn().mockResolvedValue([]),
      listStaffGroupIds: jest.fn().mockResolvedValue([]),
      findPermissionByCode: jest.fn().mockResolvedValue({
        code: PermissionCode.PaymentsView,
        description: 'Просмотр оплат',
        isFinancial: true,
      }),
      grantPermission: jest.fn().mockResolvedValue({
        code: PermissionCode.PaymentsView,
        description: 'Просмотр оплат',
        isFinancial: true,
        grantedAt: new Date('2026-03-01T10:00:00.000Z'),
        grantedById: 'admin-1',
        expiresAt: null,
      }),
      revokePermission: jest.fn().mockResolvedValue({ grantedById: 'admin-1' }),
    } as unknown as jest.Mocked<IdentityRepository>;

    identity = {
      getProfile: jest.fn().mockResolvedValue({
        id: 'user-1',
        role: UserRole.STAFF,
        scopeAllGroups: false,
        permissions: { codes: ['attendance.view'], grants: [] },
      }),
      getRolePermissions: jest.fn().mockResolvedValue(['attendance.view']),
    };

    audit = { recordSafely: jest.fn().mockResolvedValue(null) };

    service = new PermissionGrantService(
      repository,
      identity as unknown as IdentityService,
      audit as unknown as AuditService,
    );
  });

  describe('grant', () => {
    it('выдает право, которого нет у роли, и пишет аудит (BR-007)', async () => {
      const granted = await service.grant('user-1', PermissionCode.PaymentsView, 'admin-1');

      expect(granted).toMatchObject({ code: 'payments.view', isFinancial: true });
      expect(repository.grantPermission).toHaveBeenCalledWith({
        userId: 'user-1',
        code: 'payments.view',
        grantedById: 'admin-1',
        expiresAt: null,
      });
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'permission.granted', entityId: 'user-1' }),
      );
    });

    it('передает срок действия выдачи', async () => {
      const expiresAt = new Date('2026-12-31T00:00:00.000Z');

      await service.grant('user-1', PermissionCode.PaymentsView, 'admin-1', expiresAt);

      expect(repository.grantPermission).toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt }),
      );
    });

    it('отклоняет право, которого нет в каталоге permissions', async () => {
      repository.findPermissionByCode.mockResolvedValue(null);

      await expect(service.grant('user-1', 'unknown.code', 'admin-1')).rejects.toMatchObject({
        code: 'PERMISSION_UNKNOWN',
      });
      expect(repository.grantPermission).not.toHaveBeenCalled();
    });

    it('отклоняет выдачу права, которое уже дает роль', async () => {
      // Выдача ничего не изменит, но создаст иллюзию, что доступ можно отозвать.
      identity.getRolePermissions.mockResolvedValue([PermissionCode.PaymentsView]);

      await expect(
        service.grant('user-1', PermissionCode.PaymentsView, 'admin-1'),
      ).rejects.toMatchObject({ code: 'PERMISSION_GRANTED_BY_ROLE' });
      expect(repository.grantPermission).not.toHaveBeenCalled();
    });

    it('отклоняет срок действия в прошлом', async () => {
      await expect(
        service.grant('user-1', PermissionCode.PaymentsView, 'admin-1', new Date(Date.now() - 1000)),
      ).rejects.toMatchObject({ code: 'PERMISSION_EXPIRES_IN_PAST' });
      expect(repository.grantPermission).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('отзывает индивидуальную выдачу и пишет аудит', async () => {
      const result = await service.revoke('user-1', PermissionCode.PaymentsView, 'admin-1');

      expect(result).toEqual({ revoked: true, previousGrantedById: 'admin-1' });
      expect(repository.revokePermission).toHaveBeenCalledWith({
        userId: 'user-1',
        code: 'payments.view',
      });
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'permission.revoked' }),
      );
    });

    it('отклоняет отзыв права, которое пришло от роли', async () => {
      identity.getRolePermissions.mockResolvedValue([PermissionCode.PaymentsView]);

      await expect(
        service.revoke('user-1', PermissionCode.PaymentsView, 'admin-1'),
      ).rejects.toMatchObject({ code: 'PERMISSION_IS_ROLE_BASED' });
      expect(repository.revokePermission).not.toHaveBeenCalled();
    });

    it('отклоняет отзыв несуществующей выдачи', async () => {
      repository.revokePermission.mockResolvedValue(null);

      await expect(service.revoke('user-1', 'payments.view', 'admin-1')).rejects.toMatchObject({
        code: 'PERMISSION_NOT_GRANTED',
      });
      expect(audit.recordSafely).not.toHaveBeenCalled();
    });
  });

  describe('listForUser', () => {
    it('разделяет ролевые права, выдачи и итоговый набор', async () => {
      repository.findProfile.mockResolvedValue({
        ...staffProfile,
        grants: [
          {
            code: 'payments.view',
            description: 'Просмотр оплат',
            isFinancial: true,
            grantedAt: new Date('2026-03-01T10:00:00.000Z'),
            grantedById: 'admin-1',
            expiresAt: null,
          },
        ],
      });

      const view = await service.listForUser('user-1');

      expect(view).toEqual({
        userId: 'user-1',
        role: 'STAFF',
        scopeAllGroups: false,
        rolePermissions: ['attendance.view'],
        grants: [
          {
            code: 'payments.view',
            description: 'Просмотр оплат',
            isFinancial: true,
            grantedAt: '2026-03-01T10:00:00.000Z',
            grantedById: 'admin-1',
            expiresAt: null,
          },
        ],
        effective: ['attendance.view'],
      });
    });
  });
});
