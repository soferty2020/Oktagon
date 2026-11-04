import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaAthletesRepository } from '../src/modules/athletes/athletes.repository';

/**
 * Привязки аккаунтов на реальной БД (#133).
 *
 * Моками нельзя подтвердить главное: что SQL считает только действующие
 * привязки (активный пользователь, без архива и без блокировки) и что фильтр
 * linked/unlinked использует то же условие, что и подсчёт. Тест работает
 * только на тестовой БД CI (`test:e2e:db`), staging и production не трогает.
 */
describe('Athletes linked accounts (db e2e, требуется PostgreSQL)', () => {
  const prisma = new PrismaService();
  const repository = new PrismaAthletesRepository(prisma);
  const athleteIds: string[] = [];
  const userIds: string[] = [];
  const suffix = `acc-${Date.now()}`;
  let activeId: string;
  let archivedUserId: string;
  let blockedUserId: string;
  let invitedUserId: string;
  let multipleId: string;
  let archivedAthleteId: string;
  let blockedAthleteId: string;
  let invitedAthleteId: string;

  async function createAthlete(lastName: string): Promise<string> {
    const athlete = await prisma.db.athlete.create({
      data: { firstName: 'Тест', lastName, status: 'ACTIVE' },
    });
    athleteIds.push(athlete.id);
    return athlete.id;
  }

  async function createUser(
    index: number,
    status: 'ACTIVE' | 'BLOCKED' | 'INVITED',
    archived = false,
  ): Promise<string> {
    const user = await prisma.db.user.create({
      data: {
        email: `${suffix}-${index}@example.test`,
        firstName: 'Родитель',
        lastName: `Тест${index}`,
        role: 'MEMBER',
        status,
        archivedAt: archived ? new Date() : null,
      },
    });
    userIds.push(user.id);
    return user.id;
  }

  async function link(userId: string, athleteId: string): Promise<void> {
    await prisma.db.userAthlete.create({
      data: { userId, athleteId, relation: 'PARENT' },
    });
  }

  beforeAll(async () => {
    await prisma.db.$connect();

    activeId = await createAthlete(`${suffix}-Активный`);
    archivedAthleteId = await createAthlete(`${suffix}-Архивный`);
    blockedAthleteId = await createAthlete(`${suffix}-Заблокированный`);
    invitedAthleteId = await createAthlete(`${suffix}-Приглашённый`);
    multipleId = await createAthlete(`${suffix}-Несколько`);

    const activeUserId = await createUser(1, 'ACTIVE');
    archivedUserId = await createUser(2, 'ACTIVE', true);
    blockedUserId = await createUser(3, 'BLOCKED');
    invitedUserId = await createUser(4, 'INVITED');
    const secondActiveId = await createUser(5, 'ACTIVE');
    const thirdActiveId = await createUser(6, 'ACTIVE');

    await link(activeUserId, activeId);
    await link(archivedUserId, archivedAthleteId);
    await link(blockedUserId, blockedAthleteId);
    await link(invitedUserId, invitedAthleteId);
    await link(secondActiveId, multipleId);
    await link(thirdActiveId, multipleId);
  });

  afterAll(async () => {
    await prisma.db.userAthlete.deleteMany({ where: { athleteId: { in: athleteIds } } });
    await prisma.db.athlete.deleteMany({ where: { id: { in: athleteIds } } });
    await prisma.db.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.db.$disconnect();
  });

  /** Реестр без фильтров: архивный и заблокированный аккаунты не считаются. */
  it('считает только активные привязки', async () => {
    const rows = await repository.list({ athleteIds });
    const byId = new Map(rows.map((row) => [row.id, row._count.userLinks]));

    expect(byId.get(activeId)).toBe(1);
    expect(byId.get(multipleId)).toBe(2);
    expect(byId.get(archivedAthleteId)).toBe(0);
    expect(byId.get(blockedAthleteId)).toBe(0);
    expect(byId.get(invitedAthleteId)).toBe(0);
  });

  it('фильтр linked возвращает только спортсменов с активной привязкой', async () => {
    const rows = await repository.list({ athleteIds, hasAccounts: 'linked' });
    const ids = rows.map((row) => row.id).sort();

    expect(ids).toEqual([activeId, multipleId].sort());
    expect(await repository.count({ athleteIds, hasAccounts: 'linked' })).toBe(2);
  });

  it('фильтр unlinked возвращает остальных и корректный total', async () => {
    const rows = await repository.list({ athleteIds, hasAccounts: 'unlinked' });
    const ids = rows.map((row) => row.id).sort();

    expect(ids).toEqual([archivedAthleteId, blockedAthleteId, invitedAthleteId].sort());
    expect(await repository.count({ athleteIds, hasAccounts: 'unlinked' })).toBe(3);
    expect(await repository.count({ athleteIds })).toBe(5);
  });

  it('total не зависит от размера страницы, а строки не пересекаются', async () => {
    const total = await repository.count({ athleteIds, hasAccounts: 'linked' });
    const first = await repository.list({ athleteIds, hasAccounts: 'linked', take: 1, skip: 0 });
    const second = await repository.list({ athleteIds, hasAccounts: 'linked', take: 1, skip: 1 });

    expect(total).toBe(2);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0].id).not.toBe(second[0].id);
  });
});
