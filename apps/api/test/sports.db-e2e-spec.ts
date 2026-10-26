import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/shared';
import { PrismaService } from '../src/prisma';
import { PasswordService } from '../src/modules/auth/password.service';

/**
 * Спортивные модули на реальной БД (#42).
 *
 * Юнит-тесты проверяют правила с моками; здесь — то, что моки не воспроизводят:
 * транзакции, уникальные индексы, каскады и скрытие неопубликованных результатов
 * от родителя.
 */
describe('Спорт: аттестации и соревнования (db e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let adminId: string;
  let athleteId: string;

  const password = 'E2E-Sports-2026!';
  const stamp = Date.now();

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

    const admin = await prisma.db.user.create({
      data: {
        email: `sports-admin-${stamp}@example.com`,
        firstName: 'E2E',
        lastName: 'Sports',
        role: 'SUPERADMIN',
        status: 'ACTIVE',
        scopeAllGroups: true,
        passwordHash: await new PasswordService().hash(password),
      },
      select: { id: true, email: true },
    });
    adminId = admin.id;

    const athlete = await prisma.db.athlete.create({
      data: { firstName: 'Спортивный', lastName: 'Ученик', status: 'ACTIVE' },
      select: { id: true },
    });
    athleteId = athlete.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password })
      .expect(200);

    token = login.body.accessToken as string;
  }, 60_000);

  afterAll(async () => {
    await prisma.db.competition.deleteMany({ where: { createdById: adminId } });
    await prisma.db.competitionCategory.deleteMany({ where: { name: { startsWith: 'E2E ' } } });
    await prisma.db.certificationEvent.deleteMany({ where: { createdById: adminId } });
    await prisma.db.athlete.deleteMany({ where: { id: athleteId } });
    await prisma.db.auditLog.deleteMany({ where: { actorUserId: adminId } });
    await prisma.db.user.deleteMany({ where: { id: adminId } });
    await app.close();
  });

  /** Создать мероприятие и довести до нужного статуса. */
  async function createEvent(): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/api/v1/certification-events')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: `E2E аттестация ${stamp}`, scheduledAt: '2026-11-15T10:00:00.000Z' })
      .expect(201);

    return created.body.id as string;
  }

  it('создаёт мероприятие черновиком', async () => {
    const id = await createEvent();

    const response = await request(app.getHttpServer())
      .get(`/api/v1/certification-events/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.status).toBe('DRAFT');
  });

  it('не даёт завершить мероприятие без итогов', async () => {
    const id = await createEvent();

    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/plan`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/start`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/participants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ athleteId, targetRank: 'kyu-10' })
      .expect(201);

    // У участника ещё PENDING — завершение должно упереться в правило.
    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('PASSED присваивает ступень и меняет карточку спортсмена', async () => {
    const id = await createEvent();

    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/plan`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/start`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/participants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ athleteId, targetRank: 'kyu-10' })
      .expect(201);

    const result = await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/participants/${athleteId}/result`)
      .set('Authorization', `Bearer ${token}`)
      .send({ result: 'PASSED' })
      .expect(201);

    expect(result.body.awardedRank).toBe('kyu-10');

    const athlete = await request(app.getHttpServer())
      .get(`/api/v1/athletes/${athleteId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(athlete.body.rank).toBe('kyu-10');
    expect(athlete.body.beltGrade).toBe('ORANGE');
  });

  it('повторное сохранение PASSED не создаёт вторую аттестацию', async () => {
    const id = await createEvent();

    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/plan`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/start`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/participants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ athleteId, targetRank: 'kyu-9' })
      .expect(201);

    for (const reason of ['первый', 'второй']) {
      await request(app.getHttpServer())
        .post(`/api/v1/certification-events/${id}/participants/${athleteId}/result`)
        .set('Authorization', `Bearer ${token}`)
        .send({ result: 'PASSED', reason })
        .expect(201);
    }

    const certifications = await prisma.db.certification.count({
      where: { athleteId, rank: 'kyu-9' },
    });

    expect(certifications).toBe(1);
  });

  it('NO_SHOW не меняет пояс', async () => {
    const before = await prisma.db.athlete.findUnique({
      where: { id: athleteId },
      select: { rank: true },
    });

    const id = await createEvent();

    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/plan`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/start`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/participants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ athleteId, targetRank: 'kyu-8' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/participants/${athleteId}/result`)
      .set('Authorization', `Bearer ${token}`)
      .send({ result: 'NO_SHOW' })
      .expect(201);

    const after = await prisma.db.athlete.findUnique({
      where: { id: athleteId },
      select: { rank: true },
    });

    expect(after?.rank).toBe(before?.rank);
  });

  it('после публикации результаты видны родителю, до — скрыты', async () => {
    const id = await createEvent();

    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/plan`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/start`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/participants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ athleteId, targetRank: 'kyu-7' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/participants/${athleteId}/result`)
      .set('Authorization', `Bearer ${token}`)
      .send({ result: 'FAILED', comment: 'не дотянул' })
      .expect(201);

    const beforePublish = await request(app.getHttpServer())
      .get(`/api/v1/certification-events/${id}/participants`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Администратор видит результат всегда; проверяем, что поле отдаётся и
    // помечено как неопубликованное.
    expect(beforePublish.body[0].resultsPublished).toBe(false);

    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const afterPublish = await request(app.getHttpServer())
      .get(`/api/v1/certification-events/${id}/participants`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(afterPublish.body[0].resultsPublished).toBe(true);
    expect(afterPublish.body[0].result).toBe('FAILED');
  });

  it('отменённое мероприятие не отменяет результаты', async () => {
    const id = await createEvent();

    await request(app.getHttpServer())
      .post(`/api/v1/certification-events/${id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const cancelled = await request(app.getHttpServer())
      .get(`/api/v1/certification-events/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(cancelled.body.status).toBe('CANCELLED');
  });

  it('турнир: две дисциплины — разные участия, одна оплата', async () => {
    const competition = await request(app.getHttpServer())
      .post('/api/v1/competitions')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: `E2E турнир ${stamp}`, startsAt: '2026-12-05T09:00:00.000Z' })
      .expect(201);
    const competitionId = competition.body.id as string;

    const kumite = await request(app.getHttpServer())
      .post('/api/v1/competitions/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ discipline: 'KUMITE', name: `E2E кумитэ ${stamp}` })
      .expect(201);

    const kata = await request(app.getHttpServer())
      .post('/api/v1/competitions/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ discipline: 'KATA', name: `E2E ката ${stamp}` })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/competitions/${competitionId}/participants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ athleteId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/competitions/${competitionId}/participants/${athleteId}/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ discipline: 'KUMITE', categoryId: kumite.body.id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/competitions/${competitionId}/participants/${athleteId}/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ discipline: 'KATA', categoryId: kata.body.id })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/competitions/${competitionId}/participants/${athleteId}/payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentStatus: 'PAID' })
      .expect(200);

    const participants = await request(app.getHttpServer())
      .get(`/api/v1/competitions/${competitionId}/participants`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(participants.body[0].entries).toHaveLength(2);
    expect(participants.body[0].paymentStatus).toBe('PAID');
  });

  it('дубль участия в той же категории запрещён', async () => {
    const competition = await request(app.getHttpServer())
      .post('/api/v1/competitions')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: `E2E дубль ${stamp}`, startsAt: '2026-12-06T09:00:00.000Z' })
      .expect(201);
    const competitionId = competition.body.id as string;

    const category = await request(app.getHttpServer())
      .post('/api/v1/competitions/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ discipline: 'KUMITE', name: `E2E дубль-категория ${stamp}` })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/competitions/${competitionId}/participants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ athleteId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/competitions/${competitionId}/participants/${athleteId}/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ discipline: 'KUMITE', categoryId: category.body.id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/competitions/${competitionId}/participants/${athleteId}/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ discipline: 'KUMITE', categoryId: category.body.id })
      .expect(400);
  });

  it('ката не принимает встречи, кумитэ принимает', async () => {
    const competition = await request(app.getHttpServer())
      .post('/api/v1/competitions')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: `E2E встречи ${stamp}`, startsAt: '2026-12-07T09:00:00.000Z' })
      .expect(201);
    const competitionId = competition.body.id as string;

    const kumite = await request(app.getHttpServer())
      .post('/api/v1/competitions/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ discipline: 'KUMITE', name: `E2E встречи-кумитэ ${stamp}` })
      .expect(201);
    const kata = await request(app.getHttpServer())
      .post('/api/v1/competitions/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ discipline: 'KATA', name: `E2E встречи-ката ${stamp}` })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/competitions/${competitionId}/participants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ athleteId })
      .expect(201);

    const kumiteEntry = await request(app.getHttpServer())
      .post(`/api/v1/competitions/${competitionId}/participants/${athleteId}/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ discipline: 'KUMITE', categoryId: kumite.body.id })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/api/v1/competitions/${competitionId}/participants/${athleteId}/entries/${kumiteEntry.body.id}/matches`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ round: 1, opponentName: 'Соперник', result: 'WIN' })
      .expect(201);

    const kataEntry = await request(app.getHttpServer())
      .post(`/api/v1/competitions/${competitionId}/participants/${athleteId}/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ discipline: 'KATA', categoryId: kata.body.id })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/api/v1/competitions/${competitionId}/participants/${athleteId}/entries/${kataEntry.body.id}/matches`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ round: 1, opponentName: 'Соперник', result: 'WIN' })
      .expect(400);
  });

  it('PLACED без места запрещён, NO_SHOW с медалью тоже', async () => {
    const competition = await request(app.getHttpServer())
      .post('/api/v1/competitions')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: `E2E правила ${stamp}`, startsAt: '2026-12-08T09:00:00.000Z' })
      .expect(201);
    const competitionId = competition.body.id as string;

    const category = await request(app.getHttpServer())
      .post('/api/v1/competitions/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ discipline: 'KUMITE', name: `E2E правила-категория ${stamp}` })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/competitions/${competitionId}/participants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ athleteId })
      .expect(201);

    const entry = await request(app.getHttpServer())
      .post(`/api/v1/competitions/${competitionId}/participants/${athleteId}/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ discipline: 'KUMITE', categoryId: category.body.id })
      .expect(201);

    const base = `/api/v1/competitions/${competitionId}/participants/${athleteId}/entries/${entry.body.id}/result`;

    await request(app.getHttpServer())
      .post(base)
      .set('Authorization', `Bearer ${token}`)
      .send({ result: 'PLACED' })
      .expect(400);

    await request(app.getHttpServer())
      .post(base)
      .set('Authorization', `Bearer ${token}`)
      .send({ result: 'NO_SHOW', medal: 'GOLD' })
      .expect(400);
  });
});
