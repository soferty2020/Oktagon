import { type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ApiExceptionFilter, RequestIdInterceptor } from '../src/shared';
import { PrismaService } from '../src/prisma';
import { RedisService } from '../src/redis';
import { IdentityService } from '../src/modules/identity/identity.service';

/**
 * Доступ к защищенным маршрутам (docs/15-security.md, ADR-0007).
 *
 * После issue B2 маршруты защищены настоящим AuthGuard: без корректного
 * access-токена доступа нет, поэтому временный обход из B1 больше невозможен.
 */
describe('Identity access (e2e, без БД)', () => {
  let app: INestApplication;
  let accessToken: string;
  const userId = 'user-1';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: async () => undefined,
        onModuleDestroy: async () => undefined,
        isReachable: async () => true,
        db: {},
      })
      .overrideProvider(RedisService)
      .useValue({ isConfigured: false, isReachable: async () => true })
      .overrideProvider(IdentityService)
      .useValue({
        // Guard обновляет роль из БД (#50): в e2e «БД» — этот мок.
        getRole: async () => 'MEMBER',
        getProfile: async (id: string) =>
          id === userId
            ? {
                id,
                email: 'parent@example.com',
                firstName: 'Айгуль',
                lastName: 'Серик',
                middleName: null,
                phone: null,
                role: 'MEMBER',
                status: 'ACTIVE',
                scopeAllGroups: false,
                permissions: { codes: [], grants: [] },
              }
            : Promise.reject(new Error('not found')),
        listLinkedAthletes: async () => [],
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalInterceptors(new RequestIdInterceptor());
    await app.init();

    // Токен подписывается тем же секретом, что и в TokenService.
    accessToken = await app.get(JwtService).signAsync(
      { sub: userId, email: 'parent@example.com', role: 'MEMBER' },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: 900 },
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /me без токена отвечает 401', async () => {
    const response = await request(app.getHttpServer()).get('/me').expect(401);

    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('GET /me/athletes без токена отвечает 401', async () => {
    await request(app.getHttpServer()).get('/me/athletes').expect(401);
  });

  it('GET /me отклоняет мусорный токен', async () => {
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  it('GET /me отклоняет токен, подписанный другим секретом', async () => {
    const foreign = await app
      .get(JwtService)
      .signAsync({ sub: userId }, { secret: 'another-secret-value-32-characters-long', expiresIn: 900 });

    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${foreign}`)
      .expect(401);
  });

  it('GET /me с корректным токеном отдает профиль', async () => {
    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({ id: userId, email: 'parent@example.com' });
    expect(response.body).not.toHaveProperty('passwordHash');
  });
});
