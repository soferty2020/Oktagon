import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/shared';
import { PrismaService } from '../src/prisma';
import { PasswordService } from '../src/modules/auth/password.service';

/**
 * Статус оплаты для участника (B).
 *
 * Ключевое, что проверяется: родитель видит статус своих детей и не видит чужих,
 * а суммы наружу не уходят — BR-010 закрывает финансы для MEMBER.
 */
describe('Статус оплаты участника (db e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let parentToken: string;
  let parentId: string;
  let ownAthleteId: string;
  let foreignAthleteId: string;
  let groupId: string;

  const password = 'E2E-Pay-2026!';
  const stamp = Date.now();

  async function createAthlete(firstName: string): Promise<string> {
    const athlete = await prisma.db.athlete.create({
      data: { firstName, lastName: 'Проверка', status: 'ACTIVE' },
      select: { id: true },
    });
    return athlete.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();

    prisma = moduleRef.get(PrismaService);
    const now = new Date();

    const parent = await prisma.db.user.create({
      data: {
        email: `pay-parent-${stamp}@example.com`,
        firstName: 'E2E',
        lastName: 'Parent',
        role: 'MEMBER',
        status: 'ACTIVE',
        passwordHash: await new PasswordService().hash(password),
      },
      select: { id: true, email: true },
    });
    parentId = parent.id;

    ownAthleteId = await createAthlete('Свой');
    foreignAthleteId = await createAthlete('Чужой');

    // Без членства в группе спортсмен не попадает в расчет: клуб за него не
    // выставляет период, и статус был бы «не требуется».
    const group = await prisma.db.group.create({
      data: { name: `E2E pay ${stamp}` },
      select: { id: true },
    });
    groupId = group.id;

    await prisma.db.groupMembership.create({
      data: {
        groupId,
        athleteId: ownAthleteId,
        state: 'ACTIVE',
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    // Занятие в месяце: без него правило «нет тренировок — не должник»
    // освободило бы спортсмена, и статус был бы «не требуется».
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 5, 10));
    await prisma.db.trainingSession.create({
      data: {
        groupId,
        startsAt: monthStart,
        endsAt: new Date(monthStart.getTime() + 90 * 60 * 1000),
        status: 'SCHEDULED',
      },
    });

    // Связь аккаунта только со своим спортсменом: это и есть граница доступа.
    await prisma.db.userAthlete.create({
      data: { userId: parentId, athleteId: ownAthleteId, relation: 'PARENT', isPrimary: true },
    });

    // Период за текущий месяц с полной оплатой.
    await prisma.db.membershipPeriod.create({
      data: {
        athleteId: ownAthleteId,
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
        expectedAmount: 50000,
        paidAmount: 50000,
        refundedAmount: 0,
        status: 'PAID',
      },
    });

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: parent.email, password })
      .expect(200);

    parentToken = login.body.accessToken as string;
  }, 60_000);

  afterAll(async () => {
    await prisma.db.membershipPeriod.deleteMany({
      where: { athleteId: { in: [ownAthleteId, foreignAthleteId] } },
    });
    await prisma.db.trainingSession.deleteMany({ where: { groupId } });
    await prisma.db.groupMembership.deleteMany({ where: { groupId } });
    await prisma.db.group.deleteMany({ where: { id: groupId } });
    await prisma.db.userAthlete.deleteMany({ where: { userId: parentId } });
    await prisma.db.athlete.deleteMany({ where: { id: { in: [ownAthleteId, foreignAthleteId] } } });
    await prisma.db.auditLog.deleteMany({ where: { actorUserId: parentId } });
    await prisma.db.user.deleteMany({ where: { id: parentId } });
    await app.close();
  });

  it('родитель видит статус своего ребенка', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/me/athletes/${ownAthleteId}/payment-status`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);

    expect(response.body.status).toBe('PAID');
    expect(response.body.monthLabel).toMatch(/\d{4}$/);
    // Суммы наружу не отдаются: BR-010 закрывает финансы для MEMBER.
    expect(Object.keys(response.body).sort()).toEqual([
      'athleteId',
      'dueDate',
      'message',
      'month',
      'monthLabel',
      'overdue',
      'status',
      'year',
    ]);
  });

  it('родитель не видит статус чужого ребенка', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/me/athletes/${foreignAthleteId}/payment-status`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(403);
  });

  it('показывает срок оплаты, заданный клубом', async () => {
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');

    await prisma.db.clubProfile.upsert({
      where: { id: 'default' },
      update: { paymentDueDay: 10 },
      create: { id: 'default', name: 'E2E', timezone: 'Asia/Almaty', paymentDueDay: 10 },
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/me/athletes/${ownAthleteId}/payment-status`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);

    expect(response.body.dueDate).toBe(`${now.getUTCFullYear()}-${month}-10`);
    expect(response.body.overdue).toBe(false);

    await prisma.db.clubProfile.update({ where: { id: 'default' }, data: { paymentDueDay: null } });
  });
  it('без токена отвечает 401', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/me/athletes/${ownAthleteId}/payment-status`)
      .expect(401);
  });
});
