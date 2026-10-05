import { Injectable } from '@nestjs/common';
import { AthleteStatus, MembershipState, UserRole, UserStatus } from '../../../generated/prisma';
// Обычный импорт: PrismaService — DI-токен, он должен попасть в метаданные
// конструктора (emitDecoratorMetadata).
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Снимок пользователя для слоя identity: только поля профиля плюс выданные
 * лично права. Пароль и токены сюда не попадают (ADR-0007, п.4).
 */
export interface UserProfileRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  scopeAllGroups: boolean;
  grants: GrantRecord[];
}

/** Индивидуальная выдача права. */
export interface GrantRecord {
  code: string;
  description: string;
  isFinancial: boolean;
  grantedAt: Date;
  grantedById: string | null;
  expiresAt: Date | null;
}

export interface LinkedAthleteRecord {
  athleteId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  birthDate: Date | null;
  status: AthleteStatus;
  relation: string;
  isPrimary: boolean;
}

/** Пользователь в списке админки. */
export interface UserListRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  scopeAllGroups: boolean;
  createdAt: Date;
}

export interface ListUsersRecordQuery {
  role?: UserRole;
  status?: UserStatus;
  search?: string;
  skip: number;
  take: number;
}

/** Результат выдачи права. */
export interface GrantPermissionRecord {
  code: string;
  description: string;
  isFinancial: boolean;
  grantedAt: Date;
  grantedById: string | null;
  expiresAt: Date | null;
}

/**
 * Доступ к данным identity.
 *
 * Абстрактный класс, а не интерфейс: служит DI-токеном NestJS и одновременно
 * описывает контракт. Благодаря этому слой identity не зависит от Prisma
 * напрямую, а бизнес-логику можно тестировать без БД
 * (docs/13-architecture.md — изоляция внешних зависимостей).
 */
export abstract class IdentityRepository {
  abstract findProfile(userId: string): Promise<UserProfileRecord | null>;
  abstract listLinkedAthletes(userId: string): Promise<LinkedAthleteRecord[]>;
  /** Список пользователей для админки: фильтры, пагинация и общее количество. */
  abstract listUsers(
    query: ListUsersRecordQuery,
  ): Promise<{ items: UserListRecord[]; total: number }>;
  /** Идентификаторы спортсменов, которые занимаются в группах тренера. */
  abstract listCoachedAthleteIds(trainerUserId: string): Promise<string[]>;
  /** Группы, которые ведет сотрудник (активные назначения). */
  abstract listStaffGroupIds(userId: string): Promise<string[]>;

  /** Каталог permissions: проверка, что код существует. */
  abstract findPermissionByCode(
    code: string,
  ): Promise<{ code: string; description: string; isFinancial: boolean } | null>;
  /** Выдает право (upsert): повторная выдача обновляет срок и автора. */
  abstract grantPermission(input: {
    userId: string;
    code: string;
    grantedById: string;
    expiresAt: Date | null;
  }): Promise<GrantPermissionRecord>;
  /** Отзывает право. Возвращает автора прежней выдачи либо null, если ее нет. */
  abstract revokePermission(input: {
    userId: string;
    code: string;
  }): Promise<{ grantedById: string | null } | null>;
}

/**
 * Условие «выдача действует»: бессрочная либо с непрошедшим сроком.
 *
 * Проверяется при каждом чтении: иначе истекшая выдача продолжала бы давать
 * права (ADR-0006). Без `as const`: Prisma ожидает изменяемый массив условий.
 */
function activeGrantFilter(): {
  OR: Array<{ expiresAt: null } | { expiresAt: { gt: Date } }>;
} {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
}

const GRANT_SELECT = {
  grantedAt: true,
  grantedById: true,
  expiresAt: true,
  permission: { select: { code: true, description: true, isFinancial: true } },
} as const;

@Injectable()
export class PrismaIdentityRepository extends IdentityRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findProfile(userId: string): Promise<UserProfileRecord | null> {
    const user = await this.prisma.db.user.findFirst({
      where: { id: userId, archivedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        middleName: true,
        phone: true,
        role: true,
        status: true,
        scopeAllGroups: true,
        permissions: {
          where: activeGrantFilter(),
          select: GRANT_SELECT,
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      middleName: user.middleName,
      phone: user.phone,
      role: user.role,
      status: user.status,
      scopeAllGroups: user.scopeAllGroups,
      grants: user.permissions.map(toGrantRecord),
    };
  }

  async listLinkedAthletes(userId: string): Promise<LinkedAthleteRecord[]> {
    const links = await this.prisma.db.userAthlete.findMany({
      where: { userId, athlete: { archivedAt: null } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: {
        relation: true,
        isPrimary: true,
        athlete: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            birthDate: true,
            status: true,
          },
        },
      },
    });

    return links.map((link) => ({
      athleteId: link.athlete.id,
      firstName: link.athlete.firstName,
      lastName: link.athlete.lastName,
      middleName: link.athlete.middleName,
      birthDate: link.athlete.birthDate,
      status: link.athlete.status,
      relation: link.relation,
      isPrimary: link.isPrimary,
    }));
  }

  async listUsers(
    query: ListUsersRecordQuery,
  ): Promise<{ items: UserListRecord[]; total: number }> {
    const search = query.search?.trim();
    const where = {
      archivedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.user.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          middleName: true,
          phone: true,
          role: true,
          status: true,
          scopeAllGroups: true,
          createdAt: true,
        },
      }),
      this.prisma.db.user.count({ where }),
    ]);

    return { items, total };
  }

  async listCoachedAthleteIds(trainerUserId: string): Promise<string[]> {    const memberships = await this.prisma.db.groupMembership.findMany({
      where: {
        state: MembershipState.ACTIVE,
        athlete: { archivedAt: null },
        group: {
          isActive: true,
          trainers: {
            some: {
              unassignedAt: null,
              trainerProfile: { userId: trainerUserId, isActive: true },
            },
          },
        },
      },
      select: { athleteId: true },
    });

    return [...new Set(memberships.map((membership) => membership.athleteId))];
  }

  async listStaffGroupIds(userId: string): Promise<string[]> {
    const assignments = await this.prisma.db.groupTrainer.findMany({
      where: {
        unassignedAt: null,
        group: { isActive: true },
        trainerProfile: { userId, isActive: true },
      },
      select: { groupId: true },
    });

    return [...new Set(assignments.map((assignment) => assignment.groupId))];
  }

  async findPermissionByCode(
    code: string,
  ): Promise<{ code: string; description: string; isFinancial: boolean } | null> {
    return this.prisma.db.permission.findUnique({
      where: { code },
      select: { code: true, description: true, isFinancial: true },
    });
  }

  async grantPermission(input: {
    userId: string;
    code: string;
    grantedById: string;
    expiresAt: Date | null;
  }): Promise<GrantPermissionRecord> {
    const grant = await this.prisma.db.userPermission.upsert({
      where: { userId_permissionId: { userId: input.userId, permissionId: input.code } },
      create: {
        userId: input.userId,
        permissionId: input.code,
        grantedById: input.grantedById,
        expiresAt: input.expiresAt,
      },
      // Повторная выдача обновляет срок и автора: так продлевают временный доступ.
      update: {
        grantedById: input.grantedById,
        grantedAt: new Date(),
        expiresAt: input.expiresAt,
      },
      select: GRANT_SELECT,
    });

    return toGrantRecord(grant);
  }

  async revokePermission(input: {
    userId: string;
    code: string;
  }): Promise<{ grantedById: string | null } | null> {
    const existing = await this.prisma.db.userPermission.findUnique({
      where: { userId_permissionId: { userId: input.userId, permissionId: input.code } },
      select: { grantedById: true },
    });

    if (!existing) {
      return null;
    }

    await this.prisma.db.userPermission.delete({
      where: { userId_permissionId: { userId: input.userId, permissionId: input.code } },
    });

    return { grantedById: existing.grantedById };
  }
}

function toGrantRecord(grant: {
  grantedAt: Date;
  grantedById: string | null;
  expiresAt: Date | null;
  permission: { code: string; description: string; isFinancial: boolean };
}): GrantRecord {
  return {
    code: grant.permission.code,
    description: grant.permission.description,
    isFinancial: grant.permission.isFinancial,
    grantedAt: grant.grantedAt,
    grantedById: grant.grantedById,
    expiresAt: grant.expiresAt,
  };
}
