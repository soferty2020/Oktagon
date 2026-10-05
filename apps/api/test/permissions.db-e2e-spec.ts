import { Test } from '@nestjs/testing';

import { AuditService } from '../src/modules/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  IdentityRepository,
  PrismaIdentityRepository,
} from '../src/modules/identity/identity.repository';
import { IdentityService } from '../src/modules/identity/identity.service';
import { PermissionGrantService } from '../src/modules/identity/permission-grant.service';
import { ResourceScopeService } from '../src/modules/identity/resource-scope.service';

/**
 * Индивидуальные права и ресурсный scope на реальной БД (issues B5, B6).
 *
 * Проверяются утверждения, которые нельзя подтвердить моками: истекшая выдача
 * перестает действовать, право роли нельзя отозвать, scope тренера
 * ограничивается его группами.
 *
 * Требует примененной миграции в octagon_test (см. docs/27-local-development.md).
 */
describe('Permissions & scope (db e2e, требуется PostgreSQL)', () => {
  let prisma: PrismaService;
  let grants: PermissionGrantService;
  let scope: ResourceScopeService;
  let adminId: string;
  let coachId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        PrismaIdentityRepository,
        { provide: IdentityRepository, useExisting: PrismaIdentityRepository },
        { provide: AuditService, useValue: { recordSafely: async () => null } },
        IdentityService,
        PermissionGrantService,
        ResourceScopeService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    grants = moduleRef.get(PermissionGrantService);
    scope = moduleRef.get(ResourceScopeService);

    // Каталог permissions заполняется seed-ом; в тестовой базе создаем
    // недостающие записи сами, иначе проверка каталога сработает раньше
    // проверки роли.
    for (const [code, isFinancial] of [
      ['payments.view', true],
      ['analytics.view', false],
      ['users.manage', false],
    ] as const) {
      await prisma.db.permission.upsert({
        where: { code },
        update: {},
        create: { code, description: `тестовое право ${code}`, isFinancial },
      });
    }

    const stamp = Date.now();
    const admin = await prisma.db.user.create({
      data: {
        email: `perm-admin-${stamp}@example.com`,
        firstName: 'Admin',
        lastName: 'E2E',
        role: 'SUPERADMIN',
        status: 'ACTIVE',
        scopeAllGroups: true,
      },
      select: { id: true },
    });
    adminId = admin.id;
    createdUserIds.push(adminId);

    // Тренер без scopeAllGroups: его зона видимости — только свои группы.
    const coach = await prisma.db.user.create({
      data: {
        email: `perm-coach-${stamp}@example.com`,
        firstName: 'Coach',
        lastName: 'E2E',
        role: 'STAFF',
        status: 'ACTIVE',
        scopeAllGroups: false,
      },
      select: { id: true },
    });
    coachId = coach.id;
    createdUserIds.push(coachId);
  });

  afterAll(async () => {
    await prisma.db.userPermission.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.onModuleDestroy();
  });

  it('выдает право и включает его в эффективный набор', async () => {
    const before = await grants.listForUser(coachId);
    expect(before.effective).not.toContain('payments.view');

    await grants.grant(coachId, 'payments.view', adminId);

    const after = await grants.listForUser(coachId);
    expect(after.effective).toContain('payments.view');
    expect(after.grants.map((grant) => grant.code)).toContain('payments.view');
    expect(after.grants.find((grant) => grant.code === 'payments.view')?.isFinancial).toBe(true);
  });

  it('истекшая выдача не дает прав', async () => {
    const stamp = Date.now();
    const user = await prisma.db.user.create({
      data: {
        email: `perm-expired-${stamp}@example.com`,
        firstName: 'Expired',
        lastName: 'E2E',
        role: 'STAFF',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await grants.grant(user.id, 'analytics.view', adminId);
    // Сдвигаем срок в прошлое напрямую: через API выдача в прошлом запрещена.
    await prisma.db.userPermission.updateMany({
      where: { userId: user.id, permissionId: 'analytics.view' },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const view = await grants.listForUser(user.id);
    expect(view.effective).not.toContain('analytics.view');
    expect(view.grants).toHaveLength(0);
  });

  it('отзывает выданное право', async () => {
    await grants.revoke(coachId, 'payments.view', adminId);

    const after = await grants.listForUser(coachId);
    expect(after.effective).not.toContain('payments.view');
    expect(after.grants).toHaveLength(0);
  });

  it('не дает выдать право, которое уже обеспечивает роль', async () => {
    // permissions.manage есть у SUPERADMIN по роли (ADR-0006).
    await expect(
      grants.grant(adminId, 'users.manage', adminId),
    ).rejects.toMatchObject({ code: 'PERMISSION_GRANTED_BY_ROLE' });
  });

  it('не дает отозвать право, пришедшее от роли', async () => {
    await expect(
      grants.revoke(adminId, 'users.manage', adminId),
    ).rejects.toMatchObject({ code: 'PERMISSION_IS_ROLE_BASED' });
  });

  it('scope тренера ограничен его группами', async () => {
    const stamp = Date.now();

    const group = await prisma.db.group.create({
      data: { name: `perm-group-${stamp}` },
      select: { id: true },
    });
    const otherGroup = await prisma.db.group.create({
      data: { name: `perm-group-other-${stamp}` },
      select: { id: true },
    });

    const trainerProfile = await prisma.db.trainerProfile.create({
      data: { userId: coachId, displayName: 'Coach E2E' },
      select: { id: true },
    });
    await prisma.db.groupTrainer.create({
      data: { groupId: group.id, trainerProfileId: trainerProfile.id },
    });

    try {
      await expect(scope.checkGroup(coachId, group.id)).resolves.toMatchObject({
        allowed: true,
        reason: 'staff_coached_group',
      });
      await expect(scope.checkGroup(coachId, otherGroup.id)).resolves.toMatchObject({
        allowed: false,
        reason: 'denied_out_of_scope',
      });
      await expect(scope.assertGroupAccess(coachId, otherGroup.id)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    } finally {
      await prisma.db.groupTrainer.deleteMany({ where: { trainerProfileId: trainerProfile.id } });
      await prisma.db.trainerProfile.deleteMany({ where: { id: trainerProfile.id } });
      await prisma.db.group.deleteMany({ where: { id: { in: [group.id, otherGroup.id] } } });
    }
  });

  it('суперадмин видит любую группу и любого спортсмена', async () => {
    const stamp = Date.now();
    const group = await prisma.db.group.create({
      data: { name: `perm-group-admin-${stamp}` },
      select: { id: true },
    });

    try {
      await expect(scope.checkGroup(adminId, group.id)).resolves.toMatchObject({
        allowed: true,
        reason: 'role_superadmin',
      });
      await expect(scope.visibleGroupIds(adminId)).resolves.toBeNull();
    } finally {
      await prisma.db.group.deleteMany({ where: { id: group.id } });
    }
  });
});
