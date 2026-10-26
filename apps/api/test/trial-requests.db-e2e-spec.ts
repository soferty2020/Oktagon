import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/shared';
import { PrismaService } from '../src/prisma';
import { PasswordService } from '../src/modules/auth/password.service';

/**
 * Заявки на пробную тренировку (ADR-0013, #25).
 *
 * Публичная форма — единственный пишущий эндпоинт без токена. Здесь проверяем
 * именно это: что она работает без авторизации, что honeypot отсеивает ботов и
 * что список без токена недоступен.
 */
describe('Заявки на пробную тренировку (db e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let adminId: string;

  const password = 'E2E-Trial-2026!';
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
        email: `trial-admin-${stamp}@example.com`,
        firstName: 'E2E',
        lastName: 'Trial',
        role: 'SUPERADMIN',
        status: 'ACTIVE',
        scopeAllGroups: true,
        passwordHash: await new PasswordService().hash(password),
      },
      select: { id: true, email: true },
    });
    adminId = admin.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password })
      .expect(200);

    token = login.body.accessToken as string;
  }, 60_000);

  afterAll(async () => {
    await prisma.db.trialRequest.deleteMany({ where: { name: { contains: `E2E-${stamp}` } } });
    await prisma.db.user.deleteMany({ where: { id: adminId } });
    await app.close();
  });

  it('принимает заявку без авторизации', async () => {
    const name = `E2E-${stamp} Анна`;

    await request(app.getHttpServer())
      .post('/api/v1/trial-requests')
      .send({
        name,
        phone: '+79991234567',
        childName: 'Максим',
        childAge: 8,
        comment: 'Хочет попробовать',
        source: 'site',
      })
      .expect(201);

    const saved = await prisma.db.trialRequest.findFirst({ where: { name } });
    expect(saved?.status).toBe('NEW');
    expect(saved?.childAge).toBe(8);
  });

  it('honeypot: бот получает 201, но заявки нет', async () => {
    const name = `E2E-${stamp} Бот`;

    await request(app.getHttpServer())
      .post('/api/v1/trial-requests')
      .send({ name, phone: '+70000000000', website: 'http://spam.example' })
      .expect(201);

    const saved = await prisma.db.trialRequest.findFirst({ where: { name } });
    expect(saved).toBeNull();
  });

  it('без телефона заявка отвергается', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/trial-requests')
      .send({ name: `E2E-${stamp} Без телефона` })
      .expect(400);
  });

  it('список без токена недоступен', async () => {
    await request(app.getHttpServer()).get('/api/v1/trial-requests').expect(401);
  });

  it('администратор видит список и двигает статус', async () => {
    const name = `E2E-${stamp} Статус`;

    await request(app.getHttpServer())
      .post('/api/v1/trial-requests')
      .send({ name, phone: '+79990000001' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/v1/trial-requests')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const created = (list.body as { id: string; name: string }[]).find((item) => item.name === name);
    expect(created).toBeDefined();

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/trial-requests/${created?.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CONTACTED' })
      .expect(200);

    expect(updated.body.status).toBe('CONTACTED');
    expect(updated.body.processedBy.email).toContain('trial-admin');

    // Финальный статус необратим: иначе врёт конверсия.
    await request(app.getHttpServer())
      .patch(`/api/v1/trial-requests/${created?.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CONVERTED' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/trial-requests/${created?.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CONTACTED' })
      .expect(400);
  });
});
