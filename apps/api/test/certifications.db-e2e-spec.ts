import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/shared';
import { PrismaService } from '../src/prisma';
import { PasswordService } from '../src/modules/auth/password.service';

/**
 * Аттестации на реальной БД (K8).
 *
 * Юнит-тесты проверяют валидацию с моками; здесь — связку, которую моки не
 * воспроизводят: создание аттестации меняет текущий пояс в карточке, а отмена
 * возвращает пояс предыдущей аттестации. Именно эта согласованность важна клубу.
 */
describe('Аттестации (db e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let athleteId: string;
  let adminId: string;

  const password = 'E2E-Cert-2026!';
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
        email: `cert-admin-${stamp}@example.com`,
        firstName: 'E2E',
        lastName: 'Cert',
        role: 'SUPERADMIN',
        status: 'ACTIVE',
        scopeAllGroups: true,
        passwordHash: await new PasswordService().hash(password),
      },
      select: { id: true, email: true },
    });
    adminId = admin.id;

    const athlete = await prisma.db.athlete.create({
      data: { firstName: 'Али', lastName: 'Аттестованный', status: 'ACTIVE' },
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
    // Аттестации удаляются каскадом вместе со спортсменом.
    await prisma.db.athlete.deleteMany({ where: { id: athleteId } });
    await prisma.db.auditLog.deleteMany({ where: { actorUserId: adminId } });
    await prisma.db.user.deleteMany({ where: { id: adminId } });
    await app.close();
  });

  it('создает аттестацию и обновляет пояс в карточке', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/athletes/${athleteId}/certifications`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        certifiedOn: '2024-02-10',
        // 8 кю по каталогу — синий пояс (ADR-0012).
        rank: 'kyu-8',
        note: 'Весенняя аттестация',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      athleteId,
      rank: 'kyu-8',
      beltGrade: 'BLUE',
      stageLabel: '8 кю',
      certifiedOn: '2024-02-10',
    });

    const card = await request(app.getHttpServer())
      .get(`/api/v1/athletes/${athleteId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(card.body.rank).toBe('kyu-8');
    expect(card.body.beltGrade).toBe('BLUE');
    expect(card.body.beltAwardedAt).toBe('2024-02-10');
  });

  it('отдает историю от новых к старым', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/athletes/${athleteId}/certifications`)
      .set('Authorization', `Bearer ${token}`)
      .send({ certifiedOn: '2023-01-15', rank: 'kyu-0' })
      .expect(201);

    const history = await request(app.getHttpServer())
      .get(`/api/v1/athletes/${athleteId}/certifications`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(history.body).toHaveLength(2);
    expect(history.body[0].certifiedOn).toBe('2024-02-10');
    expect(history.body[1].certifiedOn).toBe('2023-01-15');
  });

  it('отмена последней аттестации возвращает предыдущий пояс', async () => {
    const history = await request(app.getHttpServer())
      .get(`/api/v1/athletes/${athleteId}/certifications`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const latest = history.body[0];

    await request(app.getHttpServer())
      .delete(`/api/v1/certifications/${latest.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const card = await request(app.getHttpServer())
      .get(`/api/v1/athletes/${athleteId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Осталась аттестация на 0 кю (белый пояс) — она и становится текущей.
    expect(card.body.beltGrade).toBe('WHITE');
    expect(card.body.beltAwardedAt).toBe('2023-01-15');
  });

  it('запрещает будущую дату и неизвестный пояс', async () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await request(app.getHttpServer())
      .post(`/api/v1/athletes/${athleteId}/certifications`)
      .set('Authorization', `Bearer ${token}`)
      .send({ certifiedOn: future, rank: 'kyu-6' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/athletes/${athleteId}/certifications`)
      .set('Authorization', `Bearer ${token}`)
      .send({ certifiedOn: '2023-01-15', beltGrade: 'GREY' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/athletes/${athleteId}/certifications`)
      .set('Authorization', `Bearer ${token}`)
      .send({ certifiedOn: '2023-01-15', rank: 'kyu-11' })
      .expect(400);
  });

  it('записывает аттестацию в аудит', async () => {
    const audit = await request(app.getHttpServer())
      .get('/api/v1/audit?action=athlete.certified&limit=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(audit.body.items.length).toBeGreaterThanOrEqual(1);
    expect(audit.body.items[0].entityType).toBe('Certification');
    expect(audit.body.items[0].after.stage).toMatch(/\d+ кю/);
  });
});
