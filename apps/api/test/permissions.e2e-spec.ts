import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/shared';
import { PrismaService } from '../src/prisma';
import { RedisService } from '../src/redis';
import { IdentityRepository, type UserProfileRecord } from '../src/modules/identity/identity.repository';
import { PermissionGrantService } from '../src/modules/identity/permission-grant.service';

/**
 * Управление индивидуальными правами (issue B5).
 *
 * БД и Redis подменяются: проверяются границы доступа (401 против 403),
 * контракт ответов и валидация тела запроса.
 */
describe('User permissions (e2e, без БД)', () => {
  let app: INestApplication;
  let superadminToken: string;
  let staffToken: string;
  let memberToken: string;

  /** Профили: суперадмин с permissions.manage, сотрудник без него, участник. */
  const profiles: Record<string, UserProfileRecord> = {
    'admin-1': {
      id: 'admin-1',
      email: 'admin@example.com',
      firstName: 'Super',
      lastName: 'Admin',
      middleName: null,
      phone: null,
      role: 'SUPERADMIN',
      status: 'ACTIVE',
      scopeAllGroups: true,
      grants: [],
    },
    'staff-1': {
      id: 'staff-1',
      email: 'coach@example.com',
      firstName: 'Алия',
      lastName: 'Нурлан',
      middleName: null,
      phone: null,
      role: 'STAFF',
      status: 'ACTIVE',
      scopeAllGroups: false,
      grants: [],
    },
    'member-1': {
      id: 'member-1',
      email: 'parent@example.com',
      firstName: 'Родитель',
      lastName: 'Участника',
      middleName: null,
      phone: null,
      role: 'MEMBER',
      status: 'ACTIVE',
      scopeAllGroups: false,
      grants: [],
    },
    'target-1': {
      id: 'target-1',
      email: 'target@example.com',
      firstName: 'Целевой',
      lastName: 'Пользователь',
      middleName: null,
      phone: null,
      role: 'STAFF',
      status: 'ACTIVE',
      scopeAllGroups: false,
      grants: [],
    },
  };

  const permissionsView = {
    userId: 'target-1',
    role: 'STAFF',
    scopeAllGroups: false,
    rolePermissions: ['attendance.view', 'attendance.edit'],
    grants: [
      {
        code: 'payments.view',
        description: 'Просмотр оплат',
        isFinancial: true,
        grantedAt: '2026-03-01T10:00:00.000Z',
        grantedById: 'admin-1',
        expiresAt: null,
      },
    ],
    effective: ['attendance.edit', 'attendance.view', 'payments.view'],
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
      .overrideProvider(IdentityRepository)
      .useValue({
        findProfile: async (userId: string) => profiles[userId] ?? null,
        listLinkedAthletes: async () => [],
        listCoachedAthleteIds: async () => [],
        listStaffGroupIds: async () => [],
        findPermissionByCode: async () => null,
        grantPermission: async () => {
          throw new Error('не должен вызываться напрямую из контроллера');
        },
        revokePermission: async () => null,
      })
      .overrideProvider(PermissionGrantService)
      .useValue({
        listForUser: async () => permissionsView,
        grant: async (_userId: string, code: string) => ({
          code,
          description: 'Просмотр оплат',
          isFinancial: true,
          grantedAt: '2026-03-01T10:00:00.000Z',
          grantedById: 'admin-1',
          expiresAt: null,
        }),
        revoke: async () => ({ revoked: true, previousGrantedById: 'admin-1' }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();

    const jwt = app.get(JwtService);
    const secret = process.env.JWT_ACCESS_SECRET;
    const sign = (sub: string) => jwt.signAsync({ sub }, { secret, expiresIn: 900 });
    [superadminToken, staffToken, memberToken] = await Promise.all([
      sign('admin-1'),
      sign('staff-1'),
      sign('member-1'),
    ]);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('без токена отвечает 401, а не 403', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/target-1/permissions')
      .expect(401);

    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('без права permissions.manage отвечает 403 со списком недостающих прав', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/target-1/permissions')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);

    expect(response.body.code).toBe('FORBIDDEN');
    expect(response.body.details.missingPermissions).toEqual(['permissions.manage']);
  });

  it('участник (MEMBER) не имеет прав вообще и получает 403', async () => {
    await request(app.getHttpServer())
      .get('/users/target-1/permissions')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
  });

  it('GET отдает ролевые права, выдачи и итоговый набор', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/target-1/permissions')
      .set('Authorization', `Bearer ${superadminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      userId: 'target-1',
      role: 'STAFF',
      rolePermissions: expect.arrayContaining(['attendance.view']),
      effective: expect.arrayContaining(['payments.view']),
    });
    expect(response.body.grants[0].isFinancial).toBe(true);
  });

  it('POST выдает право и отвечает 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/users/target-1/permissions')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ code: 'payments.view' })
      .expect(201);

    expect(response.body).toMatchObject({ code: 'payments.view', isFinancial: true });
  });

  it('POST принимает срок действия в формате ISO-8601', async () => {
    await request(app.getHttpServer())
      .post('/users/target-1/permissions')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ code: 'payments.view', expiresAt: '2026-12-31T00:00:00.000Z' })
      .expect(201);
  });

  it('POST отклоняет неизвестный код права и некорректный срок', async () => {
    await request(app.getHttpServer())
      .post('/users/target-1/permissions')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ code: 'unknown.code' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/users/target-1/permissions')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ code: 'payments.view', expiresAt: 'не-дата' })
      .expect(400);
  });

  it('DELETE отзывает право и отвечает 204', async () => {
    await request(app.getHttpServer())
      .delete('/users/target-1/permissions/payments.view')
      .set('Authorization', `Bearer ${superadminToken}`)
      .expect(204);
  });

  it('DELETE без права permissions.manage отвечает 403', async () => {
    await request(app.getHttpServer())
      .delete('/users/target-1/permissions/payments.view')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);
  });

  it('DELETE без токена отвечает 401', async () => {
    await request(app.getHttpServer())
      .delete('/users/target-1/permissions/payments.view')
      .expect(401);
  });
});
