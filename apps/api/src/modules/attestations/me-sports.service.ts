import { Injectable } from '@nestjs/common';
import { findRank } from '@octagon/contracts';

import { PrismaService } from '../../prisma/prisma.service';

/** Аттестация глазами родителя. */
export interface MeAttestation {
  id: string;
  title: string;
  scheduledAt: string;
  location: string | null;
  status: string;
  athleteId: string;
  athleteName: string;
  admission: string;
  paymentStatus: string;
  /** Публикация результатов: до неё итог не отдаётся. */
  resultsPublished: boolean;
  result: string;
  resultLabel: string | null;
}

/** Соревнование глазами родителя. */
export interface MeCompetition {
  id: string;
  title: string;
  startsAt: string;
  location: string | null;
  level: string;
  status: string;
  athleteId: string;
  athleteName: string;
  paymentStatus: string;
  resultsPublished: boolean;
  entries: {
    discipline: string;
    category: string;
    result: string;
    place: number | null;
    medal: string;
  }[];
}

export interface MeSportsOverview {
  attestations: MeAttestation[];
  competitions: MeCompetition[];
}

const RESULT_LABELS: Record<string, string> = {
  PASSED: 'Сдал',
  FAILED: 'Не сдал',
  NO_SHOW: 'Не явился',
  PENDING: 'Нет итога',
};

/**
 * Сводка мероприятий для родителя (#41).
 *
 * Фильтрация по связанным спортсменам и скрытие неопубликованных результатов —
 * здесь, а не в мобильном клиенте: клиент не должен получать то, что ему нельзя
 * показывать, даже если интерфейс ошибётся.
 */
@Injectable()
export class MeSportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(userId: string): Promise<MeSportsOverview> {
    const links = await this.prisma.db.userAthlete.findMany({
      where: { userId },
      select: { athleteId: true },
    });

    const athleteIds = links.map((link) => link.athleteId);
    if (athleteIds.length === 0) {
      return { attestations: [], competitions: [] };
    }

    const [attestations, competitions] = await Promise.all([
      this.attestations(athleteIds),
      this.competitions(athleteIds),
    ]);

    return { attestations, competitions };
  }

  private async attestations(athleteIds: string[]): Promise<MeAttestation[]> {
    const participants = await this.prisma.db.certificationParticipant.findMany({
      where: { athleteId: { in: athleteIds } },
      orderBy: { event: { scheduledAt: 'desc' } },
      select: {
        athleteId: true,
        admission: true,
        paymentStatus: true,
        result: true,
        awardedRank: true,
        athlete: { select: { firstName: true, lastName: true } },
        event: {
          select: { id: true, title: true, scheduledAt: true, location: true, status: true },
        },
      },
    });

    return participants.map((participant) => {
      const published = participant.event.status === 'PUBLISHED';
      const rank = findRank(participant.awardedRank);

      return {
        id: participant.event.id,
        title: participant.event.title,
        scheduledAt: participant.event.scheduledAt.toISOString(),
        location: participant.event.location,
        status: participant.event.status,
        athleteId: participant.athleteId,
        athleteName: `${participant.athlete.lastName} ${participant.athlete.firstName}`,
        admission: participant.admission,
        paymentStatus: participant.paymentStatus,
        resultsPublished: published,
        result: published ? participant.result : 'PENDING',
        resultLabel:
          published && participant.result === 'PASSED' && rank
            ? `Сдал: ${rank.label}`
            : published
              ? (RESULT_LABELS[participant.result] ?? null)
              : null,
      };
    });
  }

  private async competitions(athleteIds: string[]): Promise<MeCompetition[]> {
    const participants = await this.prisma.db.competitionParticipant.findMany({
      where: { athleteId: { in: athleteIds } },
      orderBy: { competition: { startsAt: 'desc' } },
      select: {
        athleteId: true,
        paymentStatus: true,
        athlete: { select: { firstName: true, lastName: true } },
        entries: {
          select: {
            discipline: true,
            categorySnapshot: true,
            result: true,
            place: true,
            medal: true,
          },
        },
        competition: {
          select: { id: true, title: true, startsAt: true, location: true, level: true, status: true },
        },
      },
    });

    return participants.map((participant) => {
      const published = participant.competition.status === 'PUBLISHED';

      return {
        id: participant.competition.id,
        title: participant.competition.title,
        startsAt: participant.competition.startsAt.toISOString(),
        location: participant.competition.location,
        level: participant.competition.level,
        status: participant.competition.status,
        athleteId: participant.athleteId,
        athleteName: `${participant.athlete.lastName} ${participant.athlete.firstName}`,
        paymentStatus: participant.paymentStatus,
        resultsPublished: published,
        entries: participant.entries.map((entry) => ({
          discipline: entry.discipline,
          category: entry.categorySnapshot,
          result: published ? entry.result : 'PENDING',
          place: published ? entry.place : null,
          medal: published ? entry.medal : 'NONE',
        })),
      };
    });
  }
}
