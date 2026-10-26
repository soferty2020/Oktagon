import { Injectable } from '@nestjs/common';
import type {
  CompetitionLevel,
  CompetitionStatus,
  CompetitionView,
  CreateCompetitionInput,
  UpdateCompetitionInput,
} from '@octagon/contracts';

import { PrismaService } from '../../prisma/prisma.service';

export interface CompetitionRecord {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  organizer: string | null;
  level: CompetitionLevel;
  description: string | null;
  status: CompetitionStatus;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  publishedById: string | null;
  cancelledAt: Date | null;
  createdBy: { id: string; email: string } | null;
  publishedBy: { id: string; email: string } | null;
  _count: { participants: number };
}

const COMPETITION_SELECT = {
  id: true,
  title: true,
  startsAt: true,
  endsAt: true,
  location: true,
  organizer: true,
  level: true,
  description: true,
  status: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  publishedById: true,
  cancelledAt: true,
  createdBy: { select: { id: true, email: true } },
  publishedBy: { select: { id: true, email: true } },
  _count: { select: { participants: true } },
} as const;

/** Доступ к турнирам (#36). */
@Injectable()
export class CompetitionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(status?: CompetitionStatus): Promise<CompetitionRecord[]> {
    return this.prisma.db.competition.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ startsAt: 'desc' }],
      select: COMPETITION_SELECT,
    });
  }

  async findById(id: string): Promise<CompetitionRecord | null> {
    return this.prisma.db.competition.findUnique({ where: { id }, select: COMPETITION_SELECT });
  }

  async create(input: CreateCompetitionInput & { createdById: string }): Promise<CompetitionRecord> {
    const { createdById, startsAt, endsAt, ...rest } = input;

    return this.prisma.db.competition.create({
      data: {
        ...rest,
        startsAt: new Date(startsAt),
        endsAt: endsAt ? new Date(endsAt) : null,
        createdById,
      },
      select: COMPETITION_SELECT,
    });
  }

  async update(
    id: string,
    patch: UpdateCompetitionInput & {
      status?: CompetitionStatus;
      publishedAt?: Date | null;
      publishedById?: string | null;
      cancelledAt?: Date | null;
    },
  ): Promise<CompetitionRecord> {
    const data: Record<string, unknown> = {};

    if (patch.title !== undefined) data.title = patch.title;
    if (patch.startsAt !== undefined) data.startsAt = new Date(patch.startsAt);
    if (patch.endsAt !== undefined) data.endsAt = patch.endsAt ? new Date(patch.endsAt) : null;
    if (patch.location !== undefined) data.location = patch.location;
    if (patch.organizer !== undefined) data.organizer = patch.organizer;
    if (patch.level !== undefined) data.level = patch.level;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.publishedAt !== undefined) data.publishedAt = patch.publishedAt;
    if (patch.publishedById !== undefined) data.publishedById = patch.publishedById;
    if (patch.cancelledAt !== undefined) data.cancelledAt = patch.cancelledAt;

    return this.prisma.db.competition.update({ where: { id }, data, select: COMPETITION_SELECT });
  }


  /** Турниры, где участвует хотя бы один из спортсменов (#39). */
  async listForAthletes(
    athleteIds: string[],
    status?: CompetitionStatus,
  ): Promise<CompetitionRecord[]> {
    if (athleteIds.length === 0) {
      return [];
    }

    return this.prisma.db.competition.findMany({
      where: {
        ...(status ? { status } : {}),
        participants: { some: { athleteId: { in: athleteIds } } },
      },
      orderBy: [{ startsAt: 'desc' }],
      select: COMPETITION_SELECT,
    });
  }

  /** Участвует ли спортсмен из списка в турнире. */
  async hasParticipant(competitionId: string, athleteIds: string[]): Promise<boolean> {
    if (athleteIds.length === 0) {
      return false;
    }

    const record = await this.prisma.db.competitionParticipant.findFirst({
      where: { competitionId, athleteId: { in: athleteIds } },
      select: { id: true },
    });

    return record !== null;
  }
  /** Сколько участий без итога: завершать турнир нельзя, пока такие есть. */
  async countPendingEntries(competitionId: string): Promise<number> {
    return this.prisma.db.competitionEntry.count({
      where: { participant: { competitionId }, result: 'PENDING' },
    });
  }
}

/** Запись → ответ API. */
export function toCompetitionView(record: CompetitionRecord): CompetitionView {
  return {
    id: record.id,
    title: record.title,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt?.toISOString() ?? null,
    location: record.location,
    organizer: record.organizer,
    level: record.level,
    description: record.description,
    status: record.status,
    participantsCount: record._count.participants,
    createdBy: record.createdBy,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
