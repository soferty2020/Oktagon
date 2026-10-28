import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/shared';
import { PrismaService } from '../src/prisma';
import { AuthRepository } from '../src/modules/auth/auth.repository';
import { PasswordService } from '../src/modules/auth/password.service';
import { RateLimiterService } from '../src/modules/auth/rate-limiter.service';
import { IdentityService } from '../src/modules/identity/identity.service';

/**
 * Контракт auth-эндпоинтов (docs/09-api.md, docs/23-api-contract-plan.md).
 *
 * БД и Redis подменяются: проверяется форма HTTP-ответов, коды ошибок и
 * границы валидации, а не хранилища.
 */
describe('Auth (e2e, без БД)', () => {
  let app: INestApplication;
  let rateLimitAllowed = true;

  const profile = {
    id: 'user-1',
    email: 'parent@example.com',
    firstName: 'Айгуль',
    lastName: 'Серик',
    middleName: null,
    phone: null,
    role: 'MEMBER',
    status: 'ACTIVE',
    scopeAllGroups: false,
    permissions: { codes: [], grants: [] },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: async () => undefined,
        onModuleDestroy: async () => undefined,
        isReachable: async () => true,
        db: {
          auditLog: { create: async () => ({ id: 'audit-1' }) },
          refreshToken: {
            create: async () => ({ id: 'rt-1' }),
            update: async () => ({}),
            updateMany: async () => ({ count: 0 }),
            findUnique: async () => null,
          },
          user: { update: async () => ({}) },
        },
      })
      .overrideProvider(AuthRepository)
      .useValue({
        findUserForAuth: async () => ({
          id: 'user-1',
          email: 'parent@example.com',
          passwordHash: await new PasswordService().hash('Correct-Horse-Battery'),
          role: 'MEMBER',
          status: 'ACTIVE',
        }),
        findUserById: async () => ({
          id: 'user-1',
          email: 'parent@example.com',
          passwordHash: null,
          role: 'MEMBER',
          status: 'ACTIVE',
        }),
        markLogin: async () => undefined,
      })
      .overrideProvider(IdentityService)
      .useValue({
        // Guard обновляет роль из БД (#50).
        getRole: async () => profile.role,
        getProfile: async () => profile,
        listLinkedAthletes: async () => [],
        canAccessAthlete: async () => true,
      })
      .overrideProvider(RateLimiterService)
      .useValue({
        consume: async () => ({
          allowed: rateLimitAllowed,
          remaining: 0,
          retryAfterSeconds: 30,
        }),
        // По email лимит только проверяется (#49, SEC-28).
        peek: async () => ({
          allowed: rateLimitAllowed,
          remaining: 0,
          retryAfterSeconds: 30,
        }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    rateLimitAllowed = true;
  });

  it('POST /auth/login возвращает токены и профиль', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'parent@example.com', password: 'Correct-Horse-Battery' })
      .expect(200);

    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: expect.any(Number),
      refreshExpiresAt: expect.any(String),
      user: { id: 'user-1', email: 'parent@example.com' },
    });
  });

  it('POST /auth/login отклоняет неверный пароль с кодом INVALID_CREDENTIALS', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'parent@example.com', password: 'wrong-password' })
      .expect(401);

    expect(response.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('POST /auth/login валидирует тело запроса', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('POST /auth/login отдает RATE_LIMITED при исчерпанном лимите', async () => {
    rateLimitAllowed = false;

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'parent@example.com', password: 'Correct-Horse-Battery' })
      .expect(429);

    expect(response.body.code).toBe('RATE_LIMITED');
  });

  it('POST /auth/refresh отклоняет неизвестный токен', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'unknown-refresh-token' })
      .expect(401);

    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('POST /auth/refresh валидирует тело запроса', async () => {
    await request(app.getHttpServer()).post('/auth/refresh').send({}).expect(400);
  });

  it('POST /auth/logout отвечает 204 даже без токена', async () => {
    await request(app.getHttpServer()).post('/auth/logout').send({}).expect(204);
  });
});
