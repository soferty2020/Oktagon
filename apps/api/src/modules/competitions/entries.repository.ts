import { Injectable } from '@nestjs/common';
import type {
  CompetitionDiscipline,
  CompetitionEntryResult,
  CompetitionMedal,
  CompetitionMatchResult,
} from '@octagon/contracts';

import { PrismaService } from '../../prisma/prisma.service';

export interface CategoryRecord {
  id: string;
  competitionId: string | null;
  discipline: CompetitionDiscipline;
  name: string;
  ageFrom: number | null;
  ageTo: number | null;
  // Prisma отдаёт Decimal; в контракте вес — число. Приводим на границе.
  weightFrom: number | null;
  weightTo: number | null;
  beltFrom: string | null;
  beltTo: string | null;
  isActive: boolean;
}

export interface EntryRecord {
  id: string;
  participantId: string;
  categoryId: string;
  discipline: CompetitionDiscipline;
  categorySnapshot: string;
  result: CompetitionEntryResult;
  place: number | null;
  medal: CompetitionMedal;
  comment: string | null;
}

export interface MatchRecord {
  id: string;
  entryId: string;
  round: number;
  opponentName: string;
  opponentClub: string | null;
  result: CompetitionMatchResult;
  note: string | null;
}

/** Доступ к категориям, участиям и встречам (#37–#38). */
@Injectable()
export class EntriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // --- категории -----------------------------------------------------------

  async listCategories(competitionId?: string): Promise<CategoryRecord[]> {
    const records = await this.prisma.db.competitionCategory.findMany({
      where: competitionId ? { OR: [{ competitionId }, { competitionId: null }] } : undefined,
      orderBy: [{ discipline: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        competitionId: true,
        discipline: true,
        name: true,
        ageFrom: true,
        ageTo: true,
        weightFrom: true,
        weightTo: true,
        beltFrom: true,
        beltTo: true,
        isActive: true,
      },
    });

    return records.map(toCategory);
  }

  async createCategory(input: {
    discipline: CompetitionDiscipline;
    name: string;
    ageFrom?: number | null;
    ageTo?: number | null;
    weightFrom?: number | null;
    weightTo?: number | null;
    beltFrom?: string | null;
    beltTo?: string | null;
    competitionId?: string | null;
  }): Promise<CategoryRecord> {
    const record = await this.prisma.db.competitionCategory.create({
      data: input,
      select: {
        id: true,
        competitionId: true,
        discipline: true,
        name: true,
        ageFrom: true,
        ageTo: true,
        weightFrom: true,
        weightTo: true,
        beltFrom: true,
        beltTo: true,
        isActive: true,
      },
    });

    return toCategory(record);
  }

  async updateCategory(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<CategoryRecord> {
    const record = await this.prisma.db.competitionCategory.update({
      where: { id },
      data: patch,
      select: {
        id: true,
        competitionId: true,
        discipline: true,
        name: true,
        ageFrom: true,
        ageTo: true,
        weightFrom: true,
        weightTo: true,
        beltFrom: true,
        beltTo: true,
        isActive: true,
      },
    });

    return toCategory(record);
  }

  async findCategory(id: string): Promise<CategoryRecord | null> {
    const record = await this.prisma.db.competitionCategory.findUnique({
      where: { id },
      select: {
        id: true,
        competitionId: true,
        discipline: true,
        name: true,
        ageFrom: true,
        ageTo: true,
        weightFrom: true,
        weightTo: true,
        beltFrom: true,
        beltTo: true,
        isActive: true,
      },
    });

    return record ? toCategory(record) : null;
  }

  // --- участники турнира ---------------------------------------------------

  async findParticipant(competitionId: string, athleteId: string) {
    return this.prisma.db.competitionParticipant.findUnique({
      where: { competitionId_athleteId: { competitionId, athleteId } },
      select: {
        id: true,
        competitionId: true,
        athleteId: true,
        responsibleTrainerId: true,
        paymentStatus: true,
        athlete: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async createParticipant(input: {
    competitionId: string;
    athleteId: string;
    responsibleTrainerId: string | null;
  }) {
    return this.prisma.db.competitionParticipant.create({
      data: input,
      select: {
        id: true,
        competitionId: true,
        athleteId: true,
        responsibleTrainerId: true,
        paymentStatus: true,
        athlete: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async updateParticipant(id: string, patch: { paymentStatus?: 'PAID' | 'UNPAID' }) {
    return this.prisma.db.competitionParticipant.update({
      where: { id },
      data: patch,
      select: {
        id: true,
        competitionId: true,
        athleteId: true,
        responsibleTrainerId: true,
        paymentStatus: true,
        athlete: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async listParticipants(competitionId: string) {
    return this.prisma.db.competitionParticipant.findMany({
      where: { competitionId },
      orderBy: [{ athlete: { lastName: 'asc' } }],
      select: {
        id: true,
        competitionId: true,
        athleteId: true,
        responsibleTrainerId: true,
        paymentStatus: true,
        athlete: { select: { id: true, firstName: true, lastName: true } },
        entries: {
          select: {
            id: true,
            discipline: true,
            categorySnapshot: true,
            result: true,
            place: true,
            medal: true,
          },
        },
      },
    });
  }

  // --- участия -------------------------------------------------------------

  async findEntry(participantId: string, categoryId: string): Promise<EntryRecord | null> {
    return this.prisma.db.competitionEntry.findUnique({
      where: { participantId_categoryId: { participantId, categoryId } },
      select: {
        id: true,
        participantId: true,
        categoryId: true,
        discipline: true,
        categorySnapshot: true,
        result: true,
        place: true,
        medal: true,
        comment: true,
      },
    });
  }

  async findEntryById(id: string): Promise<EntryRecord | null> {
    return this.prisma.db.competitionEntry.findUnique({
      where: { id },
      select: {
        id: true,
        participantId: true,
        categoryId: true,
        discipline: true,
        categorySnapshot: true,
        result: true,
        place: true,
        medal: true,
        comment: true,
      },
    });
  }

  async createEntry(input: {
    participantId: string;
    categoryId: string;
    discipline: CompetitionDiscipline;
    categorySnapshot: string;
  }): Promise<EntryRecord> {
    return this.prisma.db.competitionEntry.create({
      data: input,
      select: {
        id: true,
        participantId: true,
        categoryId: true,
        discipline: true,
        categorySnapshot: true,
        result: true,
        place: true,
        medal: true,
        comment: true,
      },
    });
  }

  /** Сколько участий без итога: публикация турнира требует полных результатов. */
  async countPending(competitionId: string): Promise<number> {
    return this.prisma.db.competitionEntry.count({
      where: { participant: { competitionId }, result: 'PENDING' },
    });
  }

  async isPublished(competitionId: string): Promise<boolean> {
    const competition = await this.prisma.db.competition.findUnique({
      where: { id: competitionId },
      select: { status: true },
    });

    return competition?.status === 'PUBLISHED';
  }

  /** Запись результата с версией: версия создаётся, если турнир опубликован. */
  async recordResult(input: {
    entryId: string;
    result: CompetitionEntryResult;
    place: number | null;
    medal: CompetitionMedal;
    comment: string | null;
    reason: string | null;
    changedById: string;
    withRevision: boolean;
  }): Promise<EntryRecord> {
    return this.prisma.db.$transaction(async (tx) => {
      if (input.withRevision) {
        const last = await tx.competitionEntryRevision.findFirst({
          where: { entryId: input.entryId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });

        await tx.competitionEntryRevision.create({
          data: {
            entryId: input.entryId,
            version: (last?.version ?? 0) + 1,
            result: input.result,
            place: input.place,
            medal: input.medal,
            comment: input.comment,
            changedById: input.changedById,
            reason: input.reason,
          },
        });
      }

      return tx.competitionEntry.update({
        where: { id: input.entryId },
        data: {
          result: input.result,
          place: input.place,
          medal: input.medal,
          comment: input.comment,
        },
        select: {
          id: true,
          participantId: true,
          categoryId: true,
          discipline: true,
          categorySnapshot: true,
          result: true,
          place: true,
          medal: true,
          comment: true,
        },
      });
    });
  }

  // --- встречи -------------------------------------------------------------

  async listMatches(entryId: string): Promise<MatchRecord[]> {
    return this.prisma.db.competitionMatch.findMany({
      where: { entryId },
      orderBy: [{ round: 'asc' }],
      select: {
        id: true,
        entryId: true,
        round: true,
        opponentName: true,
        opponentClub: true,
        result: true,
        note: true,
      },
    });
  }

  async createMatch(input: {
    entryId: string;
    round: number;
    opponentName: string;
    opponentClub: string | null;
    result: CompetitionMatchResult;
    note: string | null;
  }): Promise<MatchRecord> {
    return this.prisma.db.competitionMatch.create({
      data: input,
      select: {
        id: true,
        entryId: true,
        round: true,
        opponentName: true,
        opponentClub: true,
        result: true,
        note: true,
      },
    });
  }
}

/** Decimal → number на границе: контракт отдаёт вес числом. */
function toCategory(record: {
  id: string;
  competitionId: string | null;
  discipline: CompetitionDiscipline;
  name: string;
  ageFrom: number | null;
  ageTo: number | null;
  weightFrom: unknown;
  weightTo: unknown;
  beltFrom: string | null;
  beltTo: string | null;
  isActive: boolean;
}): CategoryRecord {
  return {
    ...record,
    weightFrom: record.weightFrom === null ? null : Number(record.weightFrom),
    weightTo: record.weightTo === null ? null : Number(record.weightTo),
  };
}