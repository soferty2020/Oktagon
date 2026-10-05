import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/shared';
import { PrismaService } from '../src/prisma';
import { RedisService } from '../src/redis';
import { IdentityService } from '../src/modules/identity/identity.service';
import { AuthRepository } from '../src/modules/auth/auth.repository';
import { InviteRepository, type InviteRecord } from '../src/modules/auth/invite.repository';
import { RateLimiterService } from '../src/modules/auth/rate-limiter.service';

/**
 * Приглашения (B3): выдача требует права users.manage
 * (docs/04-roles-permissions.md), принятие — открытый маршрут с лимитом.
 *
 * БД и Redis подменяются заглушками: проверяется контракт маршрутов и
 * границы доступа, а не хранилища.
 */
describe('Invites (e2e, без БД)', () => {
  let app: INestApplication;
  let staffToken: string;
  let adminToken: string;
  let rateLimitAllowed = true;

  const invite: InviteRecord = {
    id: 'invite-1',
    email: 'trainer@example.com',
    role: 'STAFF',
    tokenHash: 'x'.repeat(64),
    expiresAt: new Date(Date.now() + 3600 * 1000),
    usedAt: null,
    usedBy: null,
    createdAt: new Date('2026-03-01T10:00:00.000Z'),
    createdBy: 'admin-1',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: async () => undefined,
        onModuleDestroy: async () => undefined,
        isReachable: async () => true,
        db: { auditLog: { create: async () => ({ id: 'audit-1' }) } },
      })
      .overrideProvider(RedisService)
      .useValue({ isConfigured: false, isReachable: async () => true })
      .overrideProvider(AuthRepository)
      .useValue({
        // Приглашаемого еще нет: иначе создание приглашения отклоняется.
        findUserForAuth: async () => null,
        findUserById: async () => null,
        markLogin: async () => undefined,
        activateFromInvite: async () => ({ id: 'user-9' }),
      })
      .overrideProvider(InviteRepository)
      .useValue({
        // create возвращает запись плюс токен: сервис формирует ответ поверх
        // того, что вернул репозиторий.
        create: async () => ({ ...invite, token: 'a'.repeat(64) }),
        findByTokenHash: async () => null,
        findById: async () => null,
        revokePendingForEmail: async () => 0,
        consume: async () => true,
        attachConsumer: async () => undefined,
        listPending: async () => [invite],
      })
      .overrideProvider(RateLimiterService)
      .useValue({
        consume: async () => ({ allowed: rateLimitAllowed, remaining: 0, retryAfterSeconds: 30 }),
      })
      .overrideProvider(IdentityService)
      .useValue({
        // STAFF без users.manage: право есть только у суперадмина (ADR-0006).
        getPermissions: async (userId: string) =>
          userId === 'admin-1'
            ? { codes: ['users.manage'], grants: [] }
            : { codes: ['attendance.view'], grants: [] },
        getProfile: async (userId: string) => ({
          id: userId,
          email: `${userId}@example.com`,
          role: userId === 'admin-1' ? 'SUPERADMIN' : 'STAFF',
          status: 'ACTIVE',
          permissions: { codes: [], grants: [] },
        }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();

    const jwt = app.get(JwtService);
    const secret = process.env.JWT_ACCESS_SECRET;
    adminToken = await jwt.signAsync({ sub: 'admin-1', role: 'SUPERADMIN' }, { secret, expiresIn: 900 });
    staffToken = await jwt.signAsync({ sub: 'staff-1', role: 'STAFF' }, { secret, expiresIn: 900 });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    rateLimitAllowed = true;
  });

  it('POST /users/invites без токена отвечает 401, а не 403', async () => {
    const response = await request(app.getHttpServer())
      .post('/users/invites')
      .send({ email: 'trainer@example.com', role: 'STAFF' })
      .expect(401);

    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('POST /users/invites без права users.manage отвечает 403 со списком недостающих прав', async () => {
    const response = await request(app.getHttpServer())
      .post('/users/invites')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ email: 'trainer@example.com', role: 'STAFF' })
      .expect(403);

    expect(response.body.code).toBe('FORBIDDEN');
    expect(response.body.details.missingPermissions).toEqual(['users.manage']);
  });

  it('POST /users/invites с правом возвращает приглашение и токен', async () => {
    const response = await request(app.getHttpServer())
      .post('/users/invites')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'trainer@example.com', role: 'STAFF' })
      .expect(201);

    expect(response.body).toMatchObject({
      id: 'invite-1',
      email: 'trainer@example.com',
      role: 'STAFF',
      token: expect.any(String),
    });
  });

  it('POST /users/invites валидирует роль и email', async () => {
    await request(app.getHttpServer())
      .post('/users/invites')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'not-an-email', role: 'OWNER' })
      .expect(400);
  });

  it('GET /users/invites отдает список без хеша токена', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/invites')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).not.toHaveProperty('tokenHash');
    expect(response.body[0]).not.toHaveProperty('token');
  });

  it('POST /auth/accept-invite отклоняет неизвестный токен', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({
        token: 'a'.repeat(64),
        email: 'trainer@example.com',
        password: 'Correct-Horse-Battery',
        firstName: 'Алия',
        lastName: 'Нурлан',
      })
      .expect(400);

    expect(response.body.code).toBe('INVITE_INVALID');
  });

  it('POST /auth/accept-invite требует токен или inviteId', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({
        email: 'trainer@example.com',
        password: 'Correct-Horse-Battery',
        firstName: 'Алия',
        lastName: 'Нурлан',
      })
      .expect(400);

    expect(response.body.code).toBe('INVITE_INVALID');
  });

  it('POST /auth/accept-invite отдает RATE_LIMITED при исчерпанном лимите', async () => {
    rateLimitAllowed = false;

    const response = await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({
        token: 'a'.repeat(64),
        email: 'trainer@example.com',
        password: 'Correct-Horse-Battery',
        firstName: 'Алия',
        lastName: 'Нурлан',
      })
      .expect(429);

    expect(response.body.code).toBe('RATE_LIMITED');
  });

  it('POST /auth/accept-invite валидирует короткий пароль', async () => {
    await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({
        token: 'a'.repeat(64),
        email: 'trainer@example.com',
        password: 'short',
        firstName: 'Алия',
        lastName: 'Нурлан',
      })
      .expect(400);
  });
});
