import { Injectable } from '@nestjs/common';
import { AthleteStatus, BeltGrade, Gender } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

export interface AthleteRecord {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  birthDate: Date | null;
  gender: Gender;
  status: AthleteStatus;
  /** Текущий пояс (K3); белый — значение по умолчанию. */
  beltGrade: BeltGrade;
  /** Ступень из каталога (ADR-0012); null — не выведена миграцией. */
  rank: string | null;
  beltAwardedAt: Date | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AthleteAccountRecord {
  userId: string;
  email: string;
  relation: string;
  isPrimary: boolean;
}

export interface CreateAthleteInput {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  birthDate?: Date | null;
  gender?: Gender;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface UpdateAthleteInput {
  firstName?: string;
  lastName?: string;
  middleName?: string | null;
  birthDate?: Date | null;
  gender?: Gender;
  beltGrade?: BeltGrade;
  /** Ступень из каталога (ADR-0012); пишется вместе с поясом. */
  rank?: string;
  beltAwardedAt?: Date | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  status?: AthleteStatus;
}

export interface LinkAccountInput {
  athleteId: string;
  userId: string;
  relation: string;
  isPrimary: boolean;
}

/**
 * Доступ к спортсменам и связям с аккаунтами.
 *
 * Абстрактный класс как DI-токен: сервис не зависит от Prisma и тестируется
 * без БД (docs/13-architecture.md).
 */
export abstract class AthletesRepository {
  abstract list(options: { status?: AthleteStatus; search?: string }): Promise<AthleteRecord[]>;
  abstract find(id: string): Promise<AthleteRecord | null>;
  abstract create(input: CreateAthleteInput): Promise<AthleteRecord>;
  abstract update(id: string, input: UpdateAthleteInput): Promise<AthleteRecord>;
  /** Мягкое удаление: archivedAt и статус ARCHIVED (docs/08-database.md). */
  abstract archive(id: string, at: Date): Promise<void>;

  abstract listAccounts(athleteId: string): Promise<AthleteAccountRecord[]>;
  abstract findAccount(athleteId: string, userId: string): Promise<AthleteAccountRecord | null>;
  abstract linkAccount(input: LinkAccountInput): Promise<AthleteAccountRecord>;
  /** Снимает признак основного аккаунта со всех связей спортсмена. */
  abstract clearPrimary(athleteId: string): Promise<void>;
  abstract unlinkAccount(athleteId: string, userId: string): Promise<boolean>;
  /** Существует ли активный пользователь с таким идентификатором. */
  abstract userExists(userId: string): Promise<boolean>;
}

const ATHLETE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  middleName: true,
  birthDate: true,
  gender: true,
  status: true,
  beltGrade: true,
  rank: true,
  beltAwardedAt: true,
  phone: true,
  email: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaAthletesRepository extends AthletesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(options: { status?: AthleteStatus; search?: string }): Promise<AthleteRecord[]> {
    const search = options.search?.trim();

    return this.prisma.db.athlete.findMany({
      where: {
        archivedAt: null,
        ...(options.status ? { status: options.status } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { middleName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: ATHLETE_SELECT,
    });
  }

  async find(id: string): Promise<AthleteRecord | null> {
    return this.prisma.db.athlete.findFirst({
      where: { id, archivedAt: null },
      select: ATHLETE_SELECT,
    });
  }

  async create(input: CreateAthleteInput): Promise<AthleteRecord> {
    return this.prisma.db.athlete.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        middleName: input.middleName ?? null,
        birthDate: input.birthDate ?? null,
        ...(input.gender ? { gender: input.gender } : {}),
        phone: input.phone ?? null,
        email: input.email ?? null,
        notes: input.notes ?? null,
      },
      select: ATHLETE_SELECT,
    });
  }

  async update(id: string, input: UpdateAthleteInput): Promise<AthleteRecord> {
    return this.prisma.db.athlete.update({
      where: { id },
      data: input,
      select: ATHLETE_SELECT,
    });
  }

  async archive(id: string, at: Date): Promise<void> {
    await this.prisma.db.athlete.update({
      where: { id },
      data: { archivedAt: at, status: AthleteStatus.ARCHIVED },
    });
  }

  async listAccounts(athleteId: string): Promise<AthleteAccountRecord[]> {
    const links = await this.prisma.db.userAthlete.findMany({
      where: { athleteId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: {
        relation: true,
        isPrimary: true,
        user: { select: { id: true, email: true, archivedAt: true } },
      },
    });

    return links
      .filter((link) => link.user.archivedAt === null)
      .map((link) => ({
        userId: link.user.id,
        email: link.user.email,
        relation: link.relation,
        isPrimary: link.isPrimary,
      }));
  }

  async findAccount(athleteId: string, userId: string): Promise<AthleteAccountRecord | null> {
    const link = await this.prisma.db.userAthlete.findUnique({
      where: { userId_athleteId: { userId, athleteId } },
      select: {
        relation: true,
        isPrimary: true,
        user: { select: { id: true, email: true } },
      },
    });

    if (!link) {
      return null;
    }

    return {
      userId: link.user.id,
      email: link.user.email,
      relation: link.relation,
      isPrimary: link.isPrimary,
    };
  }

  async linkAccount(input: LinkAccountInput): Promise<AthleteAccountRecord> {
    const link = await this.prisma.db.userAthlete.upsert({
      where: { userId_athleteId: { userId: input.userId, athleteId: input.athleteId } },
      create: {
        userId: input.userId,
        athleteId: input.athleteId,
        relation: input.relation,
        isPrimary: input.isPrimary,
      },
      update: { relation: input.relation, isPrimary: input.isPrimary },
      select: {
        relation: true,
        isPrimary: true,
        user: { select: { id: true, email: true } },
      },
    });

    return {
      userId: link.user.id,
      email: link.user.email,
      relation: link.relation,
      isPrimary: link.isPrimary,
    };
  }

  async clearPrimary(athleteId: string): Promise<void> {
    // Основной аккаунт у спортсмена один: у остальных связей снимаем признак.
    await this.prisma.db.userAthlete.updateMany({
      where: { athleteId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  async unlinkAccount(athleteId: string, userId: string): Promise<boolean> {
    const result = await this.prisma.db.userAthlete.deleteMany({
      where: { athleteId, userId },
    });
    return result.count > 0;
  }

  async userExists(userId: string): Promise<boolean> {
    const user = await this.prisma.db.user.findFirst({
      where: { id: userId, archivedAt: null },
      select: { id: true },
    });
    return user !== null;
  }
}
