import { Test } from '@nestjs/testing';

import { AuditService } from '../src/modules/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  IdentityRepository,
  PrismaIdentityRepository,
} from '../src/modules/identity/identity.repository';
import { IdentityService } from '../src/modules/identity/identity.service';
import { ResourceScopeService } from '../src/modules/identity/resource-scope.service';
import { GroupsRepository, PrismaGroupsRepository } from '../src/modules/groups/groups.repository';
import { GroupsService } from '../src/modules/groups/groups.service';

/**
 * Группы и состав на реальной БД (issues C6–C8).
 *
 * Проверяются утверждения, которые нельзя подтвердить моками: связь групп с
 * филиалами и тренерами, ограничение «одна активная группа на спортсмена»
 * (docs/08-database.md) и история членства.
 *
 * Требует примененной миграции в octagon_test (см. docs/27-local-development.md).
 */
describe('Groups (db e2e, требуется PostgreSQL)', () => {
  let prisma: PrismaService;
  let groups: GroupsService;
  let adminId: string;
  const created: { groupIds: string[]; branchIds: string[]; athleteIds: string[]; trainerIds: string[] } = {
    groupIds: [],
    branchIds: [],
    athleteIds: [],
    trainerIds: [],
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        PrismaIdentityRepository,
        { provide: IdentityRepository, useExisting: PrismaIdentityRepository },
        IdentityService,
        ResourceScopeService,
        PrismaGroupsRepository,
        { provide: GroupsRepository, useExisting: PrismaGroupsRepository },
        { provide: AuditService, useValue: { recordSafely: async () => null } },
        GroupsService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    groups = moduleRef.get(GroupsService);

    const stamp = Date.now();
    const admin = await prisma.db.user.create({
      data: {
        email: `groups-admin-${stamp}@example.com`,
        firstName: 'Admin',
        lastName: 'E2E',
        role: 'SUPERADMIN',
        status: 'ACTIVE',
        scopeAllGroups: true,
      },
      select: { id: true },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await prisma.db.groupMembership.deleteMany({ where: { groupId: { in: created.groupIds } } });
    await prisma.db.groupTrainer.deleteMany({ where: { groupId: { in: created.groupIds } } });
    await prisma.db.groupBranch.deleteMany({ where: { groupId: { in: created.groupIds } } });
    await prisma.db.group.deleteMany({ where: { id: { in: created.groupIds } } });
    await prisma.db.trainerProfile.deleteMany({ where: { id: { in: created.trainerIds } } });
    await prisma.db.athlete.deleteMany({ where: { id: { in: created.athleteIds } } });
    await prisma.db.branch.deleteMany({ where: { id: { in: created.branchIds } } });
    await prisma.db.user.deleteMany({ where: { id: adminId } });
    await prisma.onModuleDestroy();
  });

  const newBranch = async (name: string): Promise<string> => {
    const branch = await prisma.db.branch.create({
      data: { name },
      select: { id: true },
    });
    created.branchIds.push(branch.id);
    return branch.id;
  };

  const newAthlete = async (lastName: string): Promise<string> => {
    const athlete = await prisma.db.athlete.create({
      data: { firstName: 'Тест', lastName },
      select: { id: true },
    });
    created.athleteIds.push(athlete.id);
    return athlete.id;
  };

  const newTrainer = async (displayName: string): Promise<string> => {
    const trainer = await prisma.db.trainerProfile.create({
      data: { displayName },
      select: { id: true },
    });
    created.trainerIds.push(trainer.id);
    return trainer.id;
  };

  it('создает группу и связывает ее с филиалом', async () => {
    const stamp = Date.now();
    const group = await groups.create({ name: `Группа A ${stamp}` });
    created.groupIds.push(group.id);

    const branchId = await newBranch(`Филиал A ${stamp}`);
    const details = await groups.linkBranch(adminId, group.id, { branchId, isPrimary: true });

    expect(details.branches).toHaveLength(1);
    expect(details.branches[0]).toMatchObject({ branchId, isPrimary: true });
    expect(details.primaryBranchName).toBe(`Филиал A ${stamp}`);
  });

  it('связывает группу с несколькими филиалами и хранит один основной', async () => {
    const stamp = Date.now();
    const group = await groups.create({ name: `Группа B ${stamp}` });
    created.groupIds.push(group.id);

    const first = await newBranch(`Филиал B1 ${stamp}`);
    const second = await newBranch(`Филиал B2 ${stamp}`);

    await groups.linkBranch(adminId, group.id, { branchId: first, isPrimary: true });
    const details = await groups.linkBranch(adminId, group.id, {
      branchId: second,
      isPrimary: true,
    });

    expect(details.branches).toHaveLength(2);
    expect(details.branches.filter((branch) => branch.isPrimary)).toHaveLength(1);
    expect(details.branches.find((branch) => branch.isPrimary)?.branchId).toBe(second);
  });

  it('назначает тренера и запрещает повторное назначение', async () => {
    const stamp = Date.now();
    const group = await groups.create({ name: `Группа C ${stamp}` });
    created.groupIds.push(group.id);
    const trainerId = await newTrainer(`Тренер C ${stamp}`);

    const assigned = await groups.assignTrainer(adminId, group.id, { trainerId });
    expect(assigned.trainers).toHaveLength(1);

    await expect(
      groups.assignTrainer(adminId, group.id, { trainerId }),
    ).rejects.toMatchObject({ code: 'GROUP_TRAINER_ALREADY_ASSIGNED' });
  });

  it('ведет историю назначений: повторное назначение после снятия создает новую запись', async () => {
    const stamp = Date.now();
    const group = await groups.create({ name: `Группа D ${stamp}` });
    created.groupIds.push(group.id);
    const trainerId = await newTrainer(`Тренер D ${stamp}`);

    await groups.assignTrainer(adminId, group.id, { trainerId });
    await groups.unassignTrainer(adminId, group.id, trainerId);
    const reassigned = await groups.assignTrainer(adminId, group.id, { trainerId });

    expect(reassigned.trainers).toHaveLength(1);
    const total = await prisma.db.groupTrainer.count({
      where: { groupId: group.id, trainerProfileId: trainerId },
    });
    // Две записи: освобожденная и действующая.
    expect(total).toBe(2);
  });

  it('добавляет спортсмена в группу и запрещает вторую активную группу', async () => {
    const stamp = Date.now();
    const first = await groups.create({ name: `Группа E1 ${stamp}` });
    const second = await groups.create({ name: `Группа E2 ${stamp}` });
    created.groupIds.push(first.id, second.id);
    const athleteId = await newAthlete(`Участник E ${stamp}`);

    const withMember = await groups.addMember(adminId, first.id, { athleteId });
    expect(withMember.members).toHaveLength(1);
    expect(withMember.activeMembersCount).toBe(1);

    // docs/08-database.md: одна активная GroupMembership на спортсмена.
    await expect(groups.addMember(adminId, second.id, { athleteId })).rejects.toMatchObject({
      code: 'ACTIVE_MEMBERSHIP_EXISTS',
      details: { currentGroupId: first.id },
    });
  });

  it('запрещает повторное добавление в ту же группу', async () => {
    const stamp = Date.now();
    const group = await groups.create({ name: `Группа F ${stamp}` });
    created.groupIds.push(group.id);
    const athleteId = await newAthlete(`Участник F ${stamp}`);

    await groups.addMember(adminId, group.id, { athleteId });

    await expect(groups.addMember(adminId, group.id, { athleteId })).rejects.toMatchObject({
      code: 'ATHLETE_ALREADY_MEMBER',
    });
  });

  it('завершает членство и позволяет перейти в другую группу', async () => {
    const stamp = Date.now();
    const first = await groups.create({ name: `Группа G1 ${stamp}` });
    const second = await groups.create({ name: `Группа G2 ${stamp}` });
    created.groupIds.push(first.id, second.id);
    const athleteId = await newAthlete(`Участник G ${stamp}`);

    await groups.addMember(adminId, first.id, { athleteId });
    await groups.endMembership(adminId, first.id, athleteId);

    // История сохраняется: запись осталась со state ENDED.
    const history = await prisma.db.groupMembership.findMany({ where: { athleteId } });
    expect(history).toHaveLength(1);
    expect(history[0]?.state).toBe('ENDED');
    expect(history[0]?.leftAt).not.toBeNull();

    // Спортсмен свободен и может быть добавлен в другую группу.
    const moved = await groups.addMember(adminId, second.id, { athleteId });
    expect(moved.members).toHaveLength(1);
    await expect(groups.getActiveMembership(athleteId)).resolves.toMatchObject({
      groupId: second.id,
    });
  });

  it('отдает действующую группу спортсмена', async () => {
    const stamp = Date.now();
    const group = await groups.create({ name: `Группа H ${stamp}` });
    created.groupIds.push(group.id);
    const athleteId = await newAthlete(`Участник H ${stamp}`);

    await expect(groups.getActiveMembership(athleteId)).resolves.toBeNull();
    await groups.addMember(adminId, group.id, { athleteId, joinedAt: '2026-09-01' });

    await expect(groups.getActiveMembership(athleteId)).resolves.toMatchObject({
      groupId: group.id,
      groupName: `Группа H ${stamp}`,
      joinedAt: '2026-09-01',
    });
  });
});
