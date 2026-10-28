import { Injectable } from '@nestjs/common';
import { UserRole, UserStatus } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

export interface HallRecord {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  capacity: number | null;
  isActive: boolean;
}

export interface TrainerRecord {
  id: string;
  userId: string | null;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  bio: string | null;
  isActive: boolean;
}

export interface CreateHallInput {
  name: string;
  address?: string | null;
  phone?: string | null;
  capacity?: number | null;
}

export interface UpdateHallInput {
  name?: string;
  address?: string | null;
  phone?: string | null;
  capacity?: number | null;
  isActive?: boolean;
}

export interface CreateTrainerInput {
  firstName: string;
  lastName: string;
  phone?: string | null;
  bio?: string | null;
  userId?: string | null;
}

export interface UpdateTrainerInput {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  bio?: string | null;
  isActive?: boolean;
}

/**
 * Доступ к структуре клуба: залы и тренеры.
 *
 * Абстрактный класс как DI-токен: сервис не зависит от Prisma и тестируется
 * без БД (docs/13-architecture.md). Филиалов больше нет (#64): зал — площадка,
 * группа живёт внутри зала.
 */
export abstract class ClubStructureRepository {
  abstract listHalls(options: { isActive?: boolean }): Promise<HallRecord[]>;
  abstract findHall(id: string): Promise<HallRecord | null>;
  abstract createHall(input: CreateHallInput): Promise<HallRecord>;
  abstract updateHall(id: string, input: UpdateHallInput): Promise<HallRecord>;
  abstract archiveHall(id: string, at: Date): Promise<void>;
  /**
   * Сколько в зале групп и предстоящих занятий.
   *
   * Зал удаляется только пустым: иначе группы останутся без площадки, а
   * расписание будет ссылаться на архивный зал.
   */
  /** Группы зала: карточка зала — точка входа в его группы (#65). */
  abstract listHallGroups(hallId: string): Promise<{ id: string; name: string }[]>;

  abstract countHallDependents(
    hallId: string,
    from: Date,
  ): Promise<{ groups: number; sessions: number }>;

  abstract listTrainers(options: { isActive?: boolean }): Promise<TrainerRecord[]>;
  abstract findTrainer(id: string): Promise<TrainerRecord | null>;
  abstract findTrainerByUserId(userId: string): Promise<TrainerRecord | null>;
  abstract createTrainer(input: CreateTrainerInput): Promise<TrainerRecord>;
  abstract updateTrainer(id: string, input: UpdateTrainerInput): Promise<TrainerRecord>;
  abstract archiveTrainer(id: string, at: Date): Promise<void>;
  /**
   * Связывает профиль с аккаунтом или снимает связь (`userId: null`).
   *
   * Отдельный метод, а не поле в `updateTrainer`: привязка даёт доступ к системе
   * и проверяется другим правом, поэтому не должна применяться «заодно» с
   * правкой карточки.
   */
  abstract setTrainerAccount(id: string, userId: string | null): Promise<TrainerRecord>;
  /**
   * Аккаунт для привязки к профилю тренера.
   *
   * Возвращается роль и статус: привязывать можно не любой аккаунт. Участник
   * клуба (MEMBER) не имеет прав тренера, поэтому «тренер» из него получился бы
   * только на бумаге: он не увидел бы занятия и не смог бы отмечать
   * посещаемость.
   */
  abstract findAccount(userId: string): Promise<{ role: UserRole; status: UserStatus } | null>;
}

const HALL_SELECT = {
  id: true,
  name: true,
  address: true,
  phone: true,
  capacity: true,
  isActive: true,
} as const;

const TRAINER_SELECT = {
  id: true,
  userId: true,
  displayName: true,
  firstName: true,
  lastName: true,
  phone: true,
  bio: true,
  isActive: true,
} as const;

/** «Фамилия Имя» — единый вид тренера во всех списках (#69). */
export function trainerDisplayName(firstName: string, lastName: string): string {
  return `${lastName} ${firstName}`.trim();
}

@Injectable()
export class PrismaClubStructureRepository extends ClubStructureRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listHalls(options: { isActive?: boolean }): Promise<HallRecord[]> {
    return this.prisma.db.hall.findMany({
      where: {
        archivedAt: null,
        ...(options.isActive === undefined ? {} : { isActive: options.isActive }),
      },
      orderBy: { name: 'asc' },
      select: HALL_SELECT,
    });
  }

  async findHall(id: string): Promise<HallRecord | null> {
    return this.prisma.db.hall.findFirst({ where: { id, archivedAt: null }, select: HALL_SELECT });
  }

  async createHall(input: CreateHallInput): Promise<HallRecord> {
    return this.prisma.db.hall.create({
      data: {
        name: input.name,
        address: input.address ?? null,
        phone: input.phone ?? null,
        capacity: input.capacity ?? null,
      },
      select: HALL_SELECT,
    });
  }

  async updateHall(id: string, input: UpdateHallInput): Promise<HallRecord> {
    return this.prisma.db.hall.update({ where: { id }, data: input, select: HALL_SELECT });
  }

  async archiveHall(id: string, at: Date): Promise<void> {
    await this.prisma.db.hall.update({
      where: { id },
      data: { archivedAt: at, isActive: false },
    });
  }

  async listHallGroups(hallId: string): Promise<{ id: string; name: string }[]> {
    return this.prisma.db.group.findMany({
      where: { hallId, archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async countHallDependents(
    hallId: string,
    from: Date,
  ): Promise<{ groups: number; sessions: number }> {
    const [groups, sessions] = await Promise.all([
      this.prisma.db.group.count({ where: { hallId, archivedAt: null } }),
      this.prisma.db.trainingSession.count({
        where: {
          hallId,
          startsAt: { gte: from },
          // Отменённые занятия не держат зал: они не состоятся.
          status: { not: 'CANCELLED' },
        },
      }),
    ]);

    return { groups, sessions };
  }

  async listTrainers(options: { isActive?: boolean }): Promise<TrainerRecord[]> {
    return this.prisma.db.trainerProfile.findMany({
      where: {
        archivedAt: null,
        ...(options.isActive === undefined ? {} : { isActive: options.isActive }),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: TRAINER_SELECT,
    });
  }

  async findTrainer(id: string): Promise<TrainerRecord | null> {
    return this.prisma.db.trainerProfile.findFirst({
      where: { id, archivedAt: null },
      select: TRAINER_SELECT,
    });
  }

  async findTrainerByUserId(userId: string): Promise<TrainerRecord | null> {
    return this.prisma.db.trainerProfile.findFirst({
      where: { userId, archivedAt: null },
      select: TRAINER_SELECT,
    });
  }

  async createTrainer(input: CreateTrainerInput): Promise<TrainerRecord> {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const base = {
      firstName,
      lastName,
      displayName: trainerDisplayName(firstName, lastName),
      phone: input.phone ?? null,
      bio: input.bio ?? null,
    };

    if (input.userId) {
      return this.prisma.db.trainerProfile.create({
        data: { ...base, user: { connect: { id: input.userId } } },
        select: TRAINER_SELECT,
      });
    }

    // Без аккаунта используется unchecked-вариант: он допускает userId: null,
    // тогда как checked-вариант требует relation connect.
    return this.prisma.db.trainerProfile.create({
      data: { ...base, userId: null },
      select: TRAINER_SELECT,
    });
  }

  async updateTrainer(id: string, input: UpdateTrainerInput): Promise<TrainerRecord> {
    const data: Record<string, unknown> = { ...input };

    // Имя и фамилия правятся вместе: displayName всегда их сумма, иначе в
    // списках появится «Иванов Иван» рядом с «Петров».
    if (input.firstName !== undefined || input.lastName !== undefined) {
      const current = await this.prisma.db.trainerProfile.findUnique({
        where: { id },
        select: { firstName: true, lastName: true },
      });

      const firstName = (input.firstName ?? current?.firstName ?? '').trim();
      const lastName = (input.lastName ?? current?.lastName ?? '').trim();
      data.displayName = trainerDisplayName(firstName, lastName);
      data.firstName = firstName;
      data.lastName = lastName;
    }

    return this.prisma.db.trainerProfile.update({
      where: { id },
      data,
      select: TRAINER_SELECT,
    });
  }

  async archiveTrainer(id: string, at: Date): Promise<void> {
    await this.prisma.db.trainerProfile.update({
      where: { id },
      data: { archivedAt: at, isActive: false },
    });
  }

  async setTrainerAccount(id: string, userId: string | null): Promise<TrainerRecord> {
    return this.prisma.db.trainerProfile.update({
      where: { id },
      data: { userId },
      select: TRAINER_SELECT,
    });
  }

  async findAccount(userId: string): Promise<{ role: UserRole; status: UserStatus } | null> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { role: true, status: true },
    });

    return user ? { role: user.role, status: user.status } : null;
  }
}
