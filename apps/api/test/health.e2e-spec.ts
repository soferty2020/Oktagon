import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ApiExceptionFilter, RequestIdInterceptor } from '../src/shared';
import { PrismaService } from '../src/prisma';

/**
 * Smoke e2e: приложение поднимается, единый формат ошибок соблюдается,
 * readiness отдает 503 при недоступной БД, request id проставляется.
 *
 * Переменные окружения задаются в test/setup-env.ts (до импорта AppModule).
 * docs/16-testing.md, docs/17-acceptance-criteria.md.
 */
describe('Health (e2e)', () => {
  let app: INestApplication;
  let databaseUp = false;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: async () => undefined,
        onModuleDestroy: async () => undefined,
        isReachable: async () => databaseUp,
        db: {},
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalInterceptors(new RequestIdInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health returns liveness payload', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok', service: 'octagon-api' });
    expect(response.body.environment).toBe('test');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('GET /health/ready returns 200 when the database responds', async () => {
    databaseUp = true;

    const response = await request(app.getHttpServer()).get('/health/ready').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      checks: [{ name: 'database', status: 'up' }],
    });
  });

  it('GET /health/ready returns the unified error body when the database is down', async () => {
    databaseUp = false;

    const response = await request(app.getHttpServer()).get('/health/ready').expect(503);

    expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.body.message).toBeDefined();
  });

  it('keeps the incoming request id', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'e2e-correlation-id')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('e2e-correlation-id');
  });
});
