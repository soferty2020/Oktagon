import { Injectable } from '@nestjs/common';
import { AthleteStatus, BeltGrade, MembershipState, UserRole, UserStatus } from '../../../generated/prisma';
// РћР±С‹С‡РЅС‹Р№ РёРјРїРѕСЂС‚: PrismaService вЂ” DI-С‚РѕРєРµРЅ, РѕРЅ РґРѕР»Р¶РµРЅ РїРѕРїР°СЃС‚СЊ РІ РјРµС‚Р°РґР°РЅРЅС‹Рµ
// РєРѕРЅСЃС‚СЂСѓРєС‚РѕСЂР° (emitDecoratorMetadata).
import { PrismaService } from '../../prisma/prisma.service';

/**
 * РЎРЅРёРјРѕРє РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РґР»СЏ СЃР»РѕСЏ identity: С‚РѕР»СЊРєРѕ РїРѕР»СЏ РїСЂРѕС„РёР»СЏ РїР»СЋСЃ РІС‹РґР°РЅРЅС‹Рµ
 * Р»РёС‡РЅРѕ РїСЂР°РІР°. РџР°СЂРѕР»СЊ Рё С‚РѕРєРµРЅС‹ СЃСЋРґР° РЅРµ РїРѕРїР°РґР°СЋС‚ (ADR-0007, Рї.4).
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

/** РРЅРґРёРІРёРґСѓР°Р»СЊРЅР°СЏ РІС‹РґР°С‡Р° РїСЂР°РІР°. */
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
  /** Текущий пояс (K3); белый — значение по умолчанию. */
  beltGrade: BeltGrade;
  beltAwardedAt: Date | null;
  /** Ступень из каталога (ADR-0012); пояс выводится из неё. */
  rank: string | null;
  relation: string;
  isPrimary: boolean;
}

/** РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РІ СЃРїРёСЃРєРµ Р°РґРјРёРЅРєРё. */
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

/** Р РµР·СѓР»СЊС‚Р°С‚ РІС‹РґР°С‡Рё РїСЂР°РІР°. */
export interface GrantPermissionRecord {
  code: string;
  description: string;
  isFinancial: boolean;
  grantedAt: Date;
  grantedById: string | null;
  expiresAt: Date | null;
}

/**
 * Р”РѕСЃС‚СѓРї Рє РґР°РЅРЅС‹Рј identity.
 *
 * РђР±СЃС‚СЂР°РєС‚РЅС‹Р№ РєР»Р°СЃСЃ, Р° РЅРµ РёРЅС‚РµСЂС„РµР№СЃ: СЃР»СѓР¶РёС‚ DI-С‚РѕРєРµРЅРѕРј NestJS Рё РѕРґРЅРѕРІСЂРµРјРµРЅРЅРѕ
 * РѕРїРёСЃС‹РІР°РµС‚ РєРѕРЅС‚СЂР°РєС‚. Р‘Р»Р°РіРѕРґР°СЂСЏ СЌС‚РѕРјСѓ СЃР»РѕР№ identity РЅРµ Р·Р°РІРёСЃРёС‚ РѕС‚ Prisma
 * РЅР°РїСЂСЏРјСѓСЋ, Р° Р±РёР·РЅРµСЃ-Р»РѕРіРёРєСѓ РјРѕР¶РЅРѕ С‚РµСЃС‚РёСЂРѕРІР°С‚СЊ Р±РµР· Р‘Р”
 * (docs/13-architecture.md вЂ” РёР·РѕР»СЏС†РёСЏ РІРЅРµС€РЅРёС… Р·Р°РІРёСЃРёРјРѕСЃС‚РµР№).
 */
export abstract class IdentityRepository {
  abstract findProfile(userId: string): Promise<UserProfileRecord | null>;
  abstract listLinkedAthletes(userId: string): Promise<LinkedAthleteRecord[]>;
  /** РЎРїРёСЃРѕРє РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ РґР»СЏ Р°РґРјРёРЅРєРё: С„РёР»СЊС‚СЂС‹, РїР°РіРёРЅР°С†РёСЏ Рё РѕР±С‰РµРµ РєРѕР»РёС‡РµСЃС‚РІРѕ. */
  abstract listUsers(
    query: ListUsersRecordQuery,
  ): Promise<{ items: UserListRecord[]; total: number }>;
  /**
   * Меняет статус аккаунта (#56, SEC-15).
   *
   * Блокировка нужна при увольнении: иначе сотрудник сохраняет доступ, пока
   * живёт его access-токен, и может войти заново по паролю.
   */
  abstract setStatus(userId: string, status: UserStatus): Promise<void>;
  /** РРґРµРЅС‚РёС„РёРєР°С‚РѕСЂС‹ СЃРїРѕСЂС‚СЃРјРµРЅРѕРІ, РєРѕС‚РѕСЂС‹Рµ Р·Р°РЅРёРјР°СЋС‚СЃСЏ РІ РіСЂСѓРїРїР°С… С‚СЂРµРЅРµСЂР°. */
  abstract listCoachedAthleteIds(trainerUserId: string): Promise<string[]>;
  /** Р“СЂСѓРїРїС‹, РєРѕС‚РѕСЂС‹Рµ РІРµРґРµС‚ СЃРѕС‚СЂСѓРґРЅРёРє (Р°РєС‚РёРІРЅС‹Рµ РЅР°Р·РЅР°С‡РµРЅРёСЏ). */
  abstract listStaffGroupIds(userId: string): Promise<string[]>;
  /**
   * Р“СЂСѓРїРїС‹ СЃРІСЏР·Р°РЅРЅС‹С… СЃРїРѕСЂС‚СЃРјРµРЅРѕРІ (ADR-0013).
   *
   * РќСѓР¶РЅС‹ СѓС‡Р°СЃС‚РЅРёРєСѓ: РјР°С‚СЂРёС†Р° РїСЂР°РІ РѕР±РµС‰Р°РµС‚ РµРјСѓ В«own scheduleВ» Рё В«own attendanceВ»,
   * Р° Р±РµР· СЃРїРёСЃРєР° РіСЂСѓРїРї РµРіРѕ СЃРїРѕСЂС‚СЃРјРµРЅРѕРІ scope РЅРµ РјРѕР¶РµС‚ РѕС‚РІРµС‚РёС‚СЊ, РІРёРґРЅР° Р»Рё РіСЂСѓРїРїР°.
   */
  abstract listLinkedGroupIds(userId: string): Promise<string[]>;

  /** РљР°С‚Р°Р»РѕРі permissions: РїСЂРѕРІРµСЂРєР°, С‡С‚Рѕ РєРѕРґ СЃСѓС‰РµСЃС‚РІСѓРµС‚. */
  abstract findPermissionByCode(
    code: string,
  ): Promise<{ code: string; description: string; isFinancial: boolean } | null>;
  /** Р’С‹РґР°РµС‚ РїСЂР°РІРѕ (upsert): РїРѕРІС‚РѕСЂРЅР°СЏ РІС‹РґР°С‡Р° РѕР±РЅРѕРІР»СЏРµС‚ СЃСЂРѕРє Рё Р°РІС‚РѕСЂР°. */
  abstract grantPermission(input: {
    userId: string;
    code: string;
    grantedById: string;
    expiresAt: Date | null;
  }): Promise<GrantPermissionRecord>;
  /** РћС‚Р·С‹РІР°РµС‚ РїСЂР°РІРѕ. Р’РѕР·РІСЂР°С‰Р°РµС‚ Р°РІС‚РѕСЂР° РїСЂРµР¶РЅРµР№ РІС‹РґР°С‡Рё Р»РёР±Рѕ null, РµСЃР»Рё РµРµ РЅРµС‚. */
  abstract revokePermission(input: {
    userId: string;
    code: string;
  }): Promise<{ grantedById: string | null } | null>;
}

/**
 * РЈСЃР»РѕРІРёРµ В«РІС‹РґР°С‡Р° РґРµР№СЃС‚РІСѓРµС‚В»: Р±РµСЃСЃСЂРѕС‡РЅР°СЏ Р»РёР±Рѕ СЃ РЅРµРїСЂРѕС€РµРґС€РёРј СЃСЂРѕРєРѕРј.
 *
 * РџСЂРѕРІРµСЂСЏРµС‚СЃСЏ РїСЂРё РєР°Р¶РґРѕРј С‡С‚РµРЅРёРё: РёРЅР°С‡Рµ РёСЃС‚РµРєС€Р°СЏ РІС‹РґР°С‡Р° РїСЂРѕРґРѕР»Р¶Р°Р»Р° Р±С‹ РґР°РІР°С‚СЊ
 * РїСЂР°РІР° (ADR-0006). Р‘РµР· `as const`: Prisma РѕР¶РёРґР°РµС‚ РёР·РјРµРЅСЏРµРјС‹Р№ РјР°СЃСЃРёРІ СѓСЃР»РѕРІРёР№.
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
            beltGrade: true,
            beltAwardedAt: true,
            rank: true,
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
      beltGrade: link.athlete.beltGrade,
      beltAwardedAt: link.athlete.beltAwardedAt,
      rank: link.athlete.rank,
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

  async setStatus(userId: string, status: UserStatus): Promise<void> {
    await this.prisma.db.user.update({
      where: { id: userId },
      data: { status },
    });
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

  async listLinkedGroupIds(userId: string): Promise<string[]> {
    // РўРѕР»СЊРєРѕ Р°РєС‚РёРІРЅС‹Рµ С‡Р»РµРЅСЃС‚РІР°: СЃРїРѕСЂС‚СЃРјРµРЅ, СѓС€РµРґС€РёР№ РёР· РіСЂСѓРїРїС‹, РЅРµ РґРѕР»Р¶РµРЅ
    // РѕСЃС‚Р°РІР»СЏС‚СЊ СЂРѕРґРёС‚РµР»СЋ РґРѕСЃС‚СѓРї Рє РµРµ СЂР°СЃРїРёСЃР°РЅРёСЋ (ADR-0013).
    const memberships = await this.prisma.db.groupMembership.findMany({
      where: {
        state: MembershipState.ACTIVE,
        group: { isActive: true, archivedAt: null },
        athlete: { archivedAt: null, userLinks: { some: { userId } } },
      },
      select: { groupId: true },
    });

    return [...new Set(memberships.map((membership) => membership.groupId))];
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
      // РџРѕРІС‚РѕСЂРЅР°СЏ РІС‹РґР°С‡Р° РѕР±РЅРѕРІР»СЏРµС‚ СЃСЂРѕРє Рё Р°РІС‚РѕСЂР°: С‚Р°Рє РїСЂРѕРґР»РµРІР°СЋС‚ РІСЂРµРјРµРЅРЅС‹Р№ РґРѕСЃС‚СѓРї.
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
