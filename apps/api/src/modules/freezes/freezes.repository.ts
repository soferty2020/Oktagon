import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface FreezeRecord {
  id: string;
  athleteId: string;
  athleteName: string;
  startedOn: Date;
  endedOn: Date | null;
  reason: string | null;
  createdAt: Date;
}

/**
 * Доступ к заморозкам (BR-005).
 *
 * Абстрактный класс как DI-токен: сервис не зависит от Prisma и тестируется
 * без БД (docs/13-architecture.md).
 */
export abstract class FreezeRepository {
  abstract listFreezes(athleteId: string): Promise<FreezeRecord[]>;
  abstract findOpenFreeze(athleteId: string): Promise<FreezeRecord | null>;
  abstract findFreeze(id: string): Promise<FreezeRecord | null>;
  abstract athleteExists(athleteId: string): Promise<boolean>;
  abstract createFreeze(input: {
    athleteId: string;
    startedOn: Date;
    reason: string | null;
    createdById: string;
  }): Promise<FreezeRecord>;
  abstract closeFreeze(input: {
    id: string;
    endedOn: Date;
    closedById: string;
  }): Promise<FreezeRecord>;
  /**
   * Идентификаторы спортсменов, замороженных на дату.
   *
   * Нужен задолженности: заморозка освобождает от нее (BR-004, условие 4).
   */
  abstract listFrozenAthleteIds(at: Date): Promise<string[]>;
}

const FREEZE_SELECT = {
  id: true,
  athleteId: true,
  startedOn: true,
  endedOn: true,
  reason: true,
  createdAt: true,
  athlete: { select: { firstName: true, lastName: true } },
} as const;

@Injectable()
export class PrismaFreezeRepository extends FreezeRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listFreezes(athleteId: string): Promise<FreezeRecord[]> {
    const freezes = await this.prisma.db.freezePeriod.findMany({
      where: { athleteId },
      orderBy: { startedOn: 'desc' },
      select: FREEZE_SELECT,
    });

    return freezes.map(toFreezeRecord);
  }

  async findOpenFreeze(athleteId: string): Promise<FreezeRecord | null> {
    const freeze = await this.prisma.db.freezePeriod.findFirst({
      where: { athleteId, endedOn: null },
      select: FREEZE_SELECT,
    });

    return freeze ? toFreezeRecord(freeze) : null;
  }

  async findFreeze(id: string): Promise<FreezeRecord | null> {
    const freeze = await this.prisma.db.freezePeriod.findUnique({
      where: { id },
      select: FREEZE_SELECT,
    });

    return freeze ? toFreezeRecord(freeze) : null;
  }

  async athleteExists(athleteId: string): Promise<boolean> {
    const athlete = await this.prisma.db.athlete.findFirst({
      where: { id: athleteId, archivedAt: null },
      select: { id: true },
    });
    return athlete !== null;
  }

  async createFreeze(input: {
    athleteId: string;
    startedOn: Date;
    reason: string | null;
    createdById: string;
  }): Promise<FreezeRecord> {
    const freeze = await this.prisma.db.freezePeriod.create({
      data: {
        athleteId: input.athleteId,
        startedOn: input.startedOn,
        reason: input.reason,
        createdById: input.createdById,
      },
      select: FREEZE_SELECT,
    });

    return toFreezeRecord(freeze);
  }

  async closeFreeze(input: {
    id: string;
    endedOn: Date;
    closedById: string;
  }): Promise<FreezeRecord> {
    const freeze = await this.prisma.db.freezePeriod.update({
      where: { id: input.id },
      data: { endedOn: input.endedOn, closedById: input.closedById },
      select: FREEZE_SELECT,
    });

    return toFreezeRecord(freeze);
  }

  async listFrozenAthleteIds(at: Date): Promise<string[]> {
    // Заморозка закрывает дату, если началась не позже и закончилась не раньше;
    // открытая заморозка закрывает все последующие даты.
    const freezes = await this.prisma.db.freezePeriod.findMany({
      where: {
        startedOn: { lte: at },
        OR: [{ endedOn: null }, { endedOn: { gte: at } }],
      },
      select: { athleteId: true },
    });

    return [...new Set(freezes.map((freeze) => freeze.athleteId))];
  }
}

function toFreezeRecord(freeze: {
  id: string;
  athleteId: string;
  startedOn: Date;
  endedOn: Date | null;
  reason: string | null;
  createdAt: Date;
  athlete: { firstName: string; lastName: string };
}): FreezeRecord {
  return {
    id: freeze.id,
    athleteId: freeze.athleteId,
    athleteName: `${freeze.athlete.lastName} ${freeze.athlete.firstName}`,
    startedOn: freeze.startedOn,
    endedOn: freeze.endedOn,
    reason: freeze.reason,
    createdAt: freeze.createdAt,
  };
}
