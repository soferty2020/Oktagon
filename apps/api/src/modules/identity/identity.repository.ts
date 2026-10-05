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
  grants: Array<{ code: string; grantedAt: Date }>;
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
  /** Идентификаторы спортсменов, которые занимаются в группах тренера. */
  abstract listCoachedAthleteIds(trainerUserId: string): Promise<string[]>;
}

@Injectable()
export class PrismaIdentityRepository implements IdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

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
          select: {
            grantedAt: true,
            permission: { select: { code: true } },
          },
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
      grants: user.permissions.map((grant) => ({
        code: grant.permission.code,
        grantedAt: grant.grantedAt,
      })),
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

  async listCoachedAthleteIds(trainerUserId: string): Promise<string[]> {
    const memberships = await this.prisma.db.groupMembership.findMany({
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
}
