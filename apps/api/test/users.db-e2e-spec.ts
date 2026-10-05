import { Test } from '@nestjs/testing';

import { AuditService } from '../src/modules/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  IdentityRepository,
  PrismaIdentityRepository,
} from '../src/modules/identity/identity.repository';
import { IdentityService } from '../src/modules/identity/identity.service';
import { PermissionGrantService } from '../src/modules/identity/permission-grant.service';

/**
 * Список пользователей на реальной БД (issue K2).
 *
 * Моками нельзя подтвердить главное: что фильтры и пагинация действительно
 * применяются к запросу, а архивированные и чужие по префиксу пользователи в
 * выдачу не попадают.
 *
 * Требует примененной миграции в octagon_test (см. docs/27-local-development.md).
 */
describe('Users list (db e2e, требуется PostgreSQL)', () => {
  let prisma: PrismaService;
  let identity: IdentityService;
  let prefix: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        PrismaIdentityRepository,
        { provide: IdentityRepository, useExisting: PrismaIdentityRepository },
        { provide: AuditService, useValue: { recordSafely: async () => null } },
        IdentityService,
        PermissionGrantService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    identity = moduleRef.get(IdentityService);

    // Уникальный префикс email: тесты делят одну базу и не должны видеть данные
    // друг друга.
    prefix = `users-e2e-${Date.now()}`;

    const fixtures = [
      { role: 'STAFF' as const, firstName: 'Серик', lastName: 'Тренеров', status: 'ACTIVE' as const },
      { role: 'MEMBER' as const, firstName: 'Айгуль', lastName: 'Родителева', status: 'ACTIVE' as const },
      { role: 'MEMBER' as const, firstName: 'Али', lastName: 'Учеников', status: 'BLOCKED' as const },
    ];

    for (const [index, fixture] of fixtures.entries()) {
      const user = await prisma.db.user.create({
        data: {
          email: `${prefix}-${index}@example.com`,
          firstName: fixture.firstName,
          lastName: fixture.lastName,
          role: fixture.role,
          status: fixture.status,
          scopeAllGroups: false,
        },
        select: { id: true },
      });
      createdUserIds.push(user.id);
    }

    // Архивированный пользователь не должен попадать в список.
    const archived = await prisma.db.user.create({
      data: {
        email: `${prefix}-archived@example.com`,
        firstName: 'Архив',
        lastName: 'Архивов',
        role: 'MEMBER',
        status: 'ACTIVE',
        archivedAt: new Date(),
      },
      select: { id: true },
    });
    createdUserIds.push(archived.id);
  });

  afterAll(async () => {
    await prisma.db.userPermission.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.onModuleDestroy();
  });

  it('не включает архивированных пользователей', async () => {
    const result = await identity.listUsers({ search: prefix, perPage: 100 });

    expect(result.meta.total).toBe(3);
    expect(result.items.map((user) => user.email)).not.toContain(`${prefix}-archived@example.com`);
  });

  it('фильтрует по роли', async () => {
    const result = await identity.listUsers({ search: prefix, role: 'MEMBER', perPage: 100 });

    expect(result.meta.total).toBe(2);
    expect(result.items.every((user) => user.role === 'MEMBER')).toBe(true);
  });

  it('фильтрует по статусу', async () => {
    const result = await identity.listUsers({ search: prefix, status: 'BLOCKED', perPage: 100 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.lastName).toBe('Учеников');
  });

  it('ищет по фамилии независимо от регистра', async () => {
    const result = await identity.listUsers({ search: 'тренеров', perPage: 100 });

    expect(result.items.map((user) => user.lastName)).toContain('Тренеров');
  });

  it('делит выдачу на страницы и сообщает общее количество', async () => {
    const firstPage = await identity.listUsers({ search: prefix, page: 1, perPage: 2 });
    const secondPage = await identity.listUsers({ search: prefix, page: 2, perPage: 2 });

    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.meta).toEqual({ page: 1, perPage: 2, total: 3, totalPages: 2 });
    expect(secondPage.items).toHaveLength(1);

    const ids = new Set([...firstPage.items, ...secondPage.items].map((user) => user.id));
    expect(ids.size).toBe(3);
  });

  it('не раскрывает приватные поля', async () => {
    const result = await identity.listUsers({ search: prefix, perPage: 100 });

    for (const user of result.items) {
      expect(user).not.toHaveProperty('passwordHash');
      expect(user).not.toHaveProperty('permissions');
    }
  });
});
