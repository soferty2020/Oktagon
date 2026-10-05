import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/shared';
import { PrismaService } from '../src/prisma';

/**
 * Контракт заглушки аутентификации (issue B1).
 *
 * Сама заглушка будет удалена в B2, но правило «без LOCAL_AUTH_STUB защищенные
 * маршруты закрыты» проверяем уже сейчас: оно гарантирует, что временный обход
 * не попадет в staging или production.
 */
describe('Identity auth stub (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: async () => undefined,
        onModuleDestroy: async () => undefined,
        isReachable: async () => true,
        db: {},
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.LOCAL_AUTH_STUB;
  });

  it('закрывает GET /me, когда заглушка выключена', async () => {
    delete process.env.LOCAL_AUTH_STUB;

    const response = await request(app.getHttpServer()).get('/me').expect(401);

    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('закрывает GET /me/athletes, когда заглушка выключена', async () => {
    delete process.env.LOCAL_AUTH_STUB;

    await request(app.getHttpServer()).get('/me/athletes').expect(401);
  });

  it('сообщает о включенной заглушке без заголовка x-user-id', async () => {
    process.env.LOCAL_AUTH_STUB = 'true';

    const response = await request(app.getHttpServer()).get('/me').expect(401);

    expect(response.body.message).toContain('x-user-id');
  });
});
