import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@octagon/contracts';

import { UserRole as PrismaUserRole, UserStatus as PrismaUserStatus } from '../../../generated/prisma';
import { AuditService } from '../audit/audit.service';
import type { IdentityRepository, UserListRecord } from './identity.repository';
import { IdentityService, toUserView } from './identity.service';

const record: UserListRecord = {
  id: 'user-1',
  email: 'coach@example.com',
  firstName: 'Серик',
  lastName: 'Тренеров',
  middleName: null,
  phone: '+7 700 111 22 33',
  role: PrismaUserRole.STAFF,
  status: PrismaUserStatus.ACTIVE,
  scopeAllGroups: false,
  createdAt: new Date('2026-01-15T08:00:00.000Z'),
};

describe('toUserView', () => {
  it('не раскрывает приватные поля и сериализует дату создания', () => {
    const view = toUserView(record);

    expect(view).toMatchObject({
      id: 'user-1',
      email: 'coach@example.com',
      role: 'STAFF',
      status: 'ACTIVE',
      scopeAllGroups: false,
      createdAt: '2026-01-15T08:00:00.000Z',
    });
    // пароль и токены не попадают в контракт даже косвенно
    expect(view).not.toHaveProperty('passwordHash');
    expect(view).not.toHaveProperty('grants');
  });
});

describe('IdentityService.listUsers', () => {
  let repository: jest.Mocked<IdentityRepository>;
  let service: IdentityService;

  beforeEach(() => {
    repository = {
      findProfile: jest.fn(),
      listLinkedAthletes: jest.fn(),
      listUsers: jest.fn().mockResolvedValue({ items: [record], total: 1 }),
      listCoachedAthleteIds: jest.fn(),
      listStaffGroupIds: jest.fn(),
      findPermissionByCode: jest.fn(),
      grantPermission: jest.fn(),
      revokePermission: jest.fn(),
    } as unknown as jest.Mocked<IdentityRepository>;

    service = new IdentityService(repository, {
      recordSafely: jest.fn().mockResolvedValue(null),
    } as unknown as AuditService);
  });

  it('передает фильтры в репозиторий и считает метаданные страницы', async () => {
    repository.listUsers.mockResolvedValue({ items: [record, record], total: 42 });

    const result = await service.listUsers({
      role: 'STAFF' as never,
      search: 'Серик',
      page: 2,
      perPage: 10,
    });

    expect(repository.listUsers).toHaveBeenCalledWith({
      role: 'STAFF',
      status: undefined,
      search: 'Серик',
      skip: 10,
      take: 10,
    });
    expect(result.meta).toEqual({ page: 2, perPage: 10, total: 42, totalPages: 5 });
  });

  it('применяет размер страницы по умолчанию', async () => {
    repository.listUsers.mockResolvedValue({ items: [], total: 0 });

    const result = await service.listUsers({});

    expect(repository.listUsers).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: DEFAULT_PAGE_SIZE }),
    );
    expect(result.meta).toMatchObject({ page: 1, perPage: DEFAULT_PAGE_SIZE });
    // totalPages не может быть нулем: клиенту удобнее одна пустая страница
    expect(result.meta.totalPages).toBe(1);
  });

  it('ограничивает размер страницы сверху', async () => {
    repository.listUsers.mockResolvedValue({ items: [], total: 0 });

    await service.listUsers({ perPage: 10_000 });

    expect(repository.listUsers).toHaveBeenCalledWith(
      expect.objectContaining({ take: MAX_PAGE_SIZE }),
    );
  });

  it('исправляет некорректную страницу и размер на минимальные', async () => {
    repository.listUsers.mockResolvedValue({ items: [], total: 0 });

    await service.listUsers({ page: -5, perPage: 0 });

    expect(repository.listUsers).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 1 }),
    );
  });
});
