import { Injectable } from '@nestjs/common';
import type { AthleteSportsEntry } from '@octagon/contracts';
import { AthleteStatus, BeltGrade, Gender } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

/** Параметры реестра: фильтры, сортировка и пагинация (#81). */
export interface AthleteListOptions {
  status?: AthleteStatus;
  search?: string;
  hallId?: string;
  groupId?: string;
  /** Видимая зона тренера: `null` — ограничений нет. */
  athleteIds?: string[] | null;
  sortBy?: 'lastName' | 'birthDate' | 'status';
  sortOrder?: 'asc' | 'desc';
  skip?: number;
  take?: number;
}

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
  /** Основной зал спортсмена (#66); null — не назначен. */
  hallId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Принадлежность спортсмена: группа, её тренер и филиал (#60).
 *
 * Отдельный тип, а не поля `AthleteRecord`: список спортсменов membership не
 * читает — там это лишний join на каждую строку, а карточка одна.
 */
export interface AthleteAffiliation {
  group: { id: string; name: string } | null;
  trainer: { id: string; displayName: string } | null;
  hall: { id: string; name: string } | null;
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
  /** Основной зал спортсмена (#66, #68); `null` очищает. */
  hallId?: string | null;
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
  /** Названия активных групп: один запрос на набор спортсменов. */
  abstract groupNamesByAthlete(athleteIds: string[]): Promise<Map<string, string>>;

  abstract list(options?: AthleteListOptions): Promise<AthleteRecord[]>;

  abstract count(options?: AthleteListOptions): Promise<number>;
  abstract find(id: string): Promise<AthleteRecord | null>;
  abstract create(input: CreateAthleteInput): Promise<AthleteRecord>;
  abstract update(id: string, input: UpdateAthleteInput): Promise<AthleteRecord>;
  /** Мягкое удаление: archivedAt и статус ARCHIVED (docs/08-database.md). */
  abstract archive(id: string, at: Date): Promise<void>;

  /**
   * Стирает ПДн и архивирует карточку (#56, SEC-15).
   *
   * Запрос «удалите данные ребёнка» должен выполняться: история тренировок и
   * оплат остаётся, но ФИО, контакты и дата рождения обезличиваются.
   */
  abstract erase(id: string, at: Date): Promise<void>;

  abstract listAccounts(athleteId: string): Promise<AthleteAccountRecord[]>;
  abstract findAccount(athleteId: string, userId: string): Promise<AthleteAccountRecord | null>;
  abstract linkAccount(input: LinkAccountInput): Promise<AthleteAccountRecord>;
  /** Снимает признак основного аккаунта со всех связей спортсмена. */
  abstract clearPrimary(athleteId: string): Promise<void>;
  abstract unlinkAccount(athleteId: string, userId: string): Promise<boolean>;
  /** Существует ли активный пользователь с таким идентификатором. */
  abstract userExists(userId: string): Promise<boolean>;
  /**
   * Текущая группа, тренер и филиал (#60).
   *
   * `null` в каждом поле — не назначено. Карточка показывает empty state, а не
   * подставляет первое попавшееся: «не в группе» — нормальное состояние.
   */
  abstract findAffiliation(athleteId: string): Promise<AthleteAffiliation>;

  /**
   * Спортивная история: опубликованные турниры спортсмена (#79).
   *
   * Черновики не попадают: результат ещё не подтверждён, и показывать его в
   * карточке раньше публикации — то же, что раскрыть итог аттестации до
   * публикации (#39).
   */
  abstract listSportsHistory(athleteId: string): Promise<AthleteSportsEntry[]>;
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
  // Основной зал спортсмена (#66): свой, а не зал группы.
  hallId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Текущая группа, тренер и зал: только для карточки, не для списка. */
const AFFILIATION_SELECT = {
  group: {
    select: {
      id: true,
      name: true,
      // Зал группы: филиалов больше нет, группа живёт в одном зале (#64).
      hall: { select: { id: true, name: true } },
      trainers: {
        where: { unassignedAt: null },
        orderBy: { isPrimary: 'desc' },
        take: 1,
        select: { trainerProfile: { select: { id: true, displayName: true } } },
      },
    },
  },
} as const;

@Injectable()
export class PrismaAthletesRepository extends AthletesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private where(options: AthleteListOptions) {
    const search = options.search?.trim();
    const membership =
      options.hallId || options.groupId
        ? {
            some: {
              state: 'ACTIVE' as const,
              ...(options.groupId ? { groupId: options.groupId } : {}),
              ...(options.hallId ? { group: { hallId: options.hallId } } : {}),
            },
          }
        : undefined;

    return {
      archivedAt: null,
      ...(options.status ? { status: options.status } : {}),
      ...(options.athleteIds ? { id: { in: options.athleteIds } } : {}),
      ...(membership ? { memberships: membership } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { middleName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
  }

  /** Порядок: выбранная колонка, затем ФИО и id — строки не прыгают между страницами. */
  private orderBy(options: AthleteListOptions) {
    const direction = options.sortOrder === 'desc' ? ('desc' as const) : ('asc' as const);
    const stable = [
      { lastName: direction },
      { firstName: direction },
      { middleName: direction },
      { id: direction },
    ];

    if (options.sortBy === 'birthDate') {
      // Пустые даты всегда в конце, независимо от направления.
      return [{ birthDate: { sort: direction, nulls: 'last' as const } }, ...stable];
    }
    if (options.sortBy === 'status') {
      // ACTIVE → FROZEN → ARCHIVED: порядок домена, а не случайный enum.
      return [{ status: direction }, ...stable];
    }
    return stable;
  }

  async list(options: AthleteListOptions = {}): Promise<AthleteRecord[]> {
    return this.prisma.db.athlete.findMany({
      where: this.where(options),
      orderBy: this.orderBy(options),
      ...(options.take ? { take: options.take } : {}),
      ...(options.skip ? { skip: options.skip } : {}),
      select: ATHLETE_SELECT,
    });
  }

  async count(options: AthleteListOptions = {}): Promise<number> {
    return this.prisma.db.athlete.count({ where: this.where(options) });
  }

  /** Названия активных групп для набора спортсменов: один запрос вместо N. */
  async groupNamesByAthlete(athleteIds: string[]): Promise<Map<string, string>> {
    if (athleteIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.db.groupMembership.findMany({
      where: { athleteId: { in: athleteIds }, state: 'ACTIVE' },
      orderBy: { joinedAt: 'desc' },
      select: { athleteId: true, group: { select: { name: true } } },
    });

    const names = new Map<string, string>();
    for (const row of rows) {
      if (!names.has(row.athleteId)) {
        names.set(row.athleteId, row.group.name);
      }
    }
    return names;
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

  async erase(id: string, at: Date): Promise<void> {
    // Связи с аккаунтами удаляются: иначе родитель продолжит видеть карточку.
    await this.prisma.db.userAthlete.deleteMany({ where: { athleteId: id } });

    await this.prisma.db.athlete.update({
      where: { id },
      data: {
        firstName: 'Удалённый',
        lastName: `athlete-${id.slice(0, 8)}`,
        middleName: null,
        birthDate: null,
        phone: null,
        email: null,
        notes: null,
        hallId: null,
        archivedAt: at,
        status: AthleteStatus.ARCHIVED,
      },
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

  async findAffiliation(athleteId: string): Promise<AthleteAffiliation> {
    const [athlete, membership] = await Promise.all([
      this.prisma.db.athlete.findUnique({
        where: { id: athleteId },
        select: { hall: { select: { id: true, name: true } } },
      }),
      this.prisma.db.groupMembership.findFirst({
        where: { athleteId, state: 'ACTIVE' },
        orderBy: { joinedAt: 'desc' },
        select: AFFILIATION_SELECT,
      }),
    ]);

    // Свой зал спортсмена старше зала группы: переезд в другой зал не должен
    // переписываться групповой привязкой (#66).
    const ownHall = athlete?.hall ?? null;

    if (!membership) {
      return { group: null, trainer: null, hall: ownHall };
    }

    const trainer = membership.group.trainers[0]?.trainerProfile ?? null;

    return {
      group: { id: membership.group.id, name: membership.group.name },
      trainer: trainer ? { id: trainer.id, displayName: trainer.displayName } : null,
      hall: ownHall ?? membership.group.hall,
    };
  }

  async listSportsHistory(athleteId: string): Promise<AthleteSportsEntry[]> {
    const entries = await this.prisma.db.competitionEntry.findMany({
      where: {
        // Только опубликованные: до публикации результат не подтверждён клубом.
        participant: { athleteId, competition: { status: 'PUBLISHED' } },
      },
      orderBy: { participant: { competition: { startsAt: 'desc' } } },
      select: {
        discipline: true,
        categorySnapshot: true,
        result: true,
        place: true,
        medal: true,
        participant: {
          select: {
            competition: {
              select: { id: true, title: true, startsAt: true, level: true },
            },
          },
        },
      },
    });

    return entries.map((entry) => ({
      competitionId: entry.participant.competition.id,
      competitionTitle: entry.participant.competition.title,
      startsAt: entry.participant.competition.startsAt.toISOString(),
      level: entry.participant.competition.level,
      discipline: entry.discipline,
      category: entry.categorySnapshot,
      result: entry.result,
      place: entry.place,
      medal: entry.medal === 'NONE' ? null : entry.medal,
    }));
  }
}
