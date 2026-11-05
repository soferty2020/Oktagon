import { Test } from '@nestjs/testing';

import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { AthletesRepository, PrismaAthletesRepository } from '../src/modules/athletes/athletes.repository';
import { AthletesService } from '../src/modules/athletes/athletes.service';
import { GroupsRepository, PrismaGroupsRepository } from '../src/modules/groups/groups.repository';
import { GroupsService } from '../src/modules/groups/groups.service';
import { IdentityRepository, PrismaIdentityRepository } from '../src/modules/identity/identity.repository';
import { IdentityService } from '../src/modules/identity/identity.service';
import { ResourceScopeService } from '../src/modules/identity/resource-scope.service';

/**
 * Release readiness: операции записи на реальной БД (CI).
 *
 * Проверяются не чтение, а изменения: создание спортсмена, правка, архивирование,
 * создание группы, приём в группу и связанные записи. Работает только на тестовой
 * БД CI (`test:e2e:db`), staging и production не затрагивает.
 */
describe('Release readiness: запись (db e2e, требуется PostgreSQL)', () => {
  let prisma: PrismaService;
  let athletes: AthletesService;
  let groups: GroupsService;
  let adminId: string;
  const athleteIds: string[] = [];
  const groupIds: string[] = [];
  const hallIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        PrismaIdentityRepository,
        { provide: IdentityRepository, useExisting: PrismaIdentityRepository },
        IdentityService,
        ResourceScopeService,
        PrismaAthletesRepository,
        { provide: AthletesRepository, useExisting: PrismaAthletesRepository },
        PrismaGroupsRepository,
        { provide: GroupsRepository, useExisting: PrismaGroupsRepository },
        { provide: AuditService, useValue: { recordSafely: async () => null } },
        AthletesService,
        GroupsService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    athletes = moduleRef.get(AthletesService);
    groups = moduleRef.get(GroupsService);

    const admin = await prisma.db.user.create({
      data: {
        email: `release-admin-${Date.now()}@example.test`,
        firstName: 'Release',
        lastName: 'Admin',
        role: 'SUPERADMIN',
        status: 'ACTIVE',
        scopeAllGroups: true,
      },
      select: { id: true },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await prisma.db.groupMembership.deleteMany({ where: { groupId: { in: groupIds } } });
    await prisma.db.groupTrainer.deleteMany({ where: { groupId: { in: groupIds } } });
    await prisma.db.group.deleteMany({ where: { id: { in: groupIds } } });
    await prisma.db.athlete.deleteMany({ where: { id: { in: athleteIds } } });
    await prisma.db.hall.deleteMany({ where: { id: { in: hallIds } } });
    await prisma.db.user.delete({ where: { id: adminId } });
    await prisma.onModuleDestroy();
  });

  it('создаёт спортсмена и возвращает сохранённые поля', async () => {
    const created = await athletes.create({
      firstName: 'Тест',
      lastName: `Спортсмен ${Date.now()}`,
      birthDate: '2012-05-14',
      phone: '+7 700 000 00 01',
    });
    athleteIds.push(created.id);

    expect(created.firstName).toBe('Тест');
    expect(created.birthDate).toBe('2012-05-14');

    const stored = await prisma.db.athlete.findUnique({ where: { id: created.id } });
    expect(stored?.status).toBe('ACTIVE');
    expect(stored?.phone).toBe('+7 700 000 00 01');
  });

  it('правит карточку и видит изменения в базе', async () => {
    const created = await athletes.create({ firstName: 'Имя', lastName: `Правка ${Date.now()}` });
    athleteIds.push(created.id);

    await athletes.update(adminId, created.id, { firstName: 'Новое', middleName: 'Отчество' });

    const stored = await prisma.db.athlete.findUnique({ where: { id: created.id } });
    expect(stored?.firstName).toBe('Новое');
    expect(stored?.middleName).toBe('Отчество');
  });

  it('архивирование убирает спортсмена из активного реестра', async () => {
    const created = await athletes.create({ firstName: 'Архив', lastName: `Тестов ${Date.now()}` });
    athleteIds.push(created.id);

    await athletes.archive(adminId, created.id);

    const stored = await prisma.db.athlete.findUnique({ where: { id: created.id } });
    expect(stored?.status).toBe('ARCHIVED');
    expect(stored?.archivedAt).not.toBeNull();
  });

  it('создаёт группу в зале и принимает спортсмена', async () => {
    const hall = await prisma.db.hall.create({
      data: { name: `Зал ${Date.now()}` },
      select: { id: true },
    });
    hallIds.push(hall.id);

    const group = await groups.create({ name: `Группа ${Date.now()}`, hallId: hall.id });
    groupIds.push(group.id);

    const athlete = await athletes.create({ firstName: 'Член', lastName: `Группы ${Date.now()}` });
    athleteIds.push(athlete.id);

    await groups.addMember(adminId, group.id, { athleteId: athlete.id });

    const membership = await prisma.db.groupMembership.findFirst({
      where: { groupId: group.id, athleteId: athlete.id },
    });
    expect(membership?.state).toBe('ACTIVE');
  });

  it('архивирование спортсмена снимает активное членство', async () => {
    const hall = await prisma.db.hall.create({ data: { name: `Зал-2 ${Date.now()}` }, select: { id: true } });
    hallIds.push(hall.id);
    const group = await groups.create({ name: `Группа-2 ${Date.now()}`, hallId: hall.id });
    groupIds.push(group.id);
    const athlete = await athletes.create({ firstName: 'Уход', lastName: `Из группы ${Date.now()}` });
    athleteIds.push(athlete.id);

    await groups.addMember(adminId, group.id, { athleteId: athlete.id });
    await athletes.archive(adminId, athlete.id);

    const active = await prisma.db.groupMembership.count({
      where: { groupId: group.id, athleteId: athlete.id, state: 'ACTIVE' },
    });
    expect(active).toBe(0);
  });
});
