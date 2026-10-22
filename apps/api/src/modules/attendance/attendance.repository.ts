import { Injectable } from '@nestjs/common';
import { AttendanceStatus, TrainingSessionStatus } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

export interface SessionRecord {
  id: string;
  groupId: string;
  groupName: string;
  startsAt: Date;
  endsAt: Date;
  status: TrainingSessionStatus;
}

export interface AttendanceRecord {
  athleteId: string;
  status: AttendanceStatus;
  comment: string | null;
  markedAt: Date;
  markedById: string | null;
}

/**
 * Отметка вместе с занятием.
 *
 * Нужна сводке за период: без идентификатора занятия нельзя отличить отметку
 * этого занятия от отметки другого, и статус размножился бы по всему периоду.
 */
export interface SessionAttendanceRecord extends AttendanceRecord {
  sessionId: string;
}

export interface PlannedAbsenceRecord {
  id: string;
  athleteId: string;
  athleteName: string;
  reason: string | null;
  reportedAt: Date;
}

/**
 * Отметка вместе с занятием и группой.
 *
 * Нужна истории посещений спортсмена: сводка показывает проценты, а по ним нельзя
 * ответить, был ли ребенок на конкретном занятии.
 */
export interface AthleteAttendanceEntryRecord {
  sessionId: string;
  groupId: string;
  groupName: string;
  startsAt: Date;
  status: AttendanceStatus;
  comment: string | null;
  markedAt: Date;
}

export interface UpsertAttendanceInput {
  sessionId: string;
  athleteId: string;
  status: AttendanceStatus;
  comment: string | null;
  markedById: string;
}

/**
 * Доступ к посещаемости.
 *
 * Абстрактный класс как DI-токен: сервис не зависит от Prisma и тестируется
 * без БД (docs/13-architecture.md).
 */
export abstract class AttendanceRepository {
  abstract findSession(sessionId: string): Promise<SessionRecord | null>;
  abstract listSessionIds(groupId: string, from: Date, to: Date): Promise<string[]>;

  abstract listAttendance(sessionId: string): Promise<AttendanceRecord[]>;
  /** Отметки по нескольким занятиям сразу: нужно сводке за период. */
  abstract listAttendanceForSessions(sessionIds: string[]): Promise<SessionAttendanceRecord[]>;
  /** Отметки спортсмена за период — история посещений, от новых к старым. */
  abstract listAthleteAttendance(
    athleteId: string,
    from: Date,
    to: Date,
  ): Promise<AthleteAttendanceEntryRecord[]>;
  abstract findAttendance(
    sessionId: string,
    athleteId: string,
  ): Promise<AttendanceRecord | null>;
  /** Идемпотентная запись отметки: повторная отметка обновляет статус. */
  abstract upsertAttendance(input: UpsertAttendanceInput): Promise<AttendanceRecord>;
  abstract deleteAttendance(sessionId: string, athleteId: string): Promise<boolean>;

  abstract listPlannedAbsences(sessionId: string): Promise<PlannedAbsenceRecord[]>;
  abstract findPlannedAbsence(
    sessionId: string,
    athleteId: string,
  ): Promise<PlannedAbsenceRecord | null>;
  abstract upsertPlannedAbsence(input: {
    sessionId: string;
    athleteId: string;
    reason: string | null;
    reportedById: string;
  }): Promise<PlannedAbsenceRecord>;
  abstract deletePlannedAbsence(sessionId: string, athleteId: string): Promise<boolean>;
}

const ATTENDANCE_SELECT = {
  athleteId: true,
  status: true,
  comment: true,
  markedAt: true,
  markedById: true,
} as const;

@Injectable()
export class PrismaAttendanceRepository extends AttendanceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findSession(sessionId: string): Promise<SessionRecord | null> {
    const session = await this.prisma.db.trainingSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        groupId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        group: { select: { name: true } },
      },
    });

    if (!session) {
      return null;
    }

    return {
      id: session.id,
      groupId: session.groupId,
      groupName: session.group.name,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      status: session.status,
    };
  }

  async listSessionIds(groupId: string, from: Date, to: Date): Promise<string[]> {
    const sessions = await this.prisma.db.trainingSession.findMany({
      where: {
        groupId,
        startsAt: { gte: from, lt: to },
        // Перенесенные занятия тоже состоялись, поэтому в сводку попадают;
        // отмененные — нет.
        status: { not: TrainingSessionStatus.CANCELLED },
      },
      select: { id: true },
    });

    return sessions.map((session) => session.id);
  }

  async listAttendance(sessionId: string): Promise<AttendanceRecord[]> {
    const marks = await this.prisma.db.attendance.findMany({
      where: { trainingSessionId: sessionId },
      select: ATTENDANCE_SELECT,
    });

    return marks.map(toAttendanceRecord);
  }

  async listAttendanceForSessions(sessionIds: string[]): Promise<SessionAttendanceRecord[]> {
    if (sessionIds.length === 0) {
      return [];
    }

    const marks = await this.prisma.db.attendance.findMany({
      where: { trainingSessionId: { in: sessionIds } },
      select: { ...ATTENDANCE_SELECT, trainingSessionId: true },
    });

    return marks.map((mark) => ({
      ...toAttendanceRecord(mark),
      sessionId: mark.trainingSessionId,
    }));
  }

  async listAthleteAttendance(
    athleteId: string,
    from: Date,
    to: Date,
  ): Promise<AthleteAttendanceEntryRecord[]> {
    const marks = await this.prisma.db.attendance.findMany({
      where: {
        athleteId,
        trainingSession: { startsAt: { gte: from, lt: to } },
      },
      select: {
        ...ATTENDANCE_SELECT,
        trainingSessionId: true,
        trainingSession: {
          select: {
            groupId: true,
            startsAt: true,
            group: { select: { name: true } },
          },
        },
      },
      orderBy: { trainingSession: { startsAt: 'desc' } },
    });

    return marks.map((mark) => ({
      sessionId: mark.trainingSessionId,
      groupId: mark.trainingSession.groupId,
      groupName: mark.trainingSession.group.name,
      startsAt: mark.trainingSession.startsAt,
      status: mark.status,
      comment: mark.comment,
      markedAt: mark.markedAt,
    }));
  }

  async findAttendance(
    sessionId: string,
    athleteId: string,
  ): Promise<AttendanceRecord | null> {
    const mark = await this.prisma.db.attendance.findUnique({
      where: { trainingSessionId_athleteId: { trainingSessionId: sessionId, athleteId } },
      select: ATTENDANCE_SELECT,
    });

    return mark ? toAttendanceRecord(mark) : null;
  }

  async upsertAttendance(input: UpsertAttendanceInput): Promise<AttendanceRecord> {
    const mark = await this.prisma.db.attendance.upsert({
      where: {
        trainingSessionId_athleteId: {
          trainingSessionId: input.sessionId,
          athleteId: input.athleteId,
        },
      },
      create: {
        trainingSessionId: input.sessionId,
        athleteId: input.athleteId,
        status: input.status,
        comment: input.comment,
        markedById: input.markedById,
      },
      // Повторная отметка обновляет статус и автора: тренер исправляет ошибку,
      // а не создает вторую запись.
      update: {
        status: input.status,
        comment: input.comment,
        markedById: input.markedById,
        markedAt: new Date(),
      },
      select: ATTENDANCE_SELECT,
    });

    return toAttendanceRecord(mark);
  }

  async deleteAttendance(sessionId: string, athleteId: string): Promise<boolean> {
    const result = await this.prisma.db.attendance.deleteMany({
      where: { trainingSessionId: sessionId, athleteId },
    });
    return result.count > 0;
  }

  async listPlannedAbsences(sessionId: string): Promise<PlannedAbsenceRecord[]> {
    const absences = await this.prisma.db.plannedAbsence.findMany({
      where: { trainingSessionId: sessionId },
      select: {
        id: true,
        athleteId: true,
        reason: true,
        createdAt: true,
        athlete: { select: { firstName: true, lastName: true } },
      },
    });

    return absences.map((absence) => ({
      id: absence.id,
      athleteId: absence.athleteId,
      athleteName: `${absence.athlete.lastName} ${absence.athlete.firstName}`,
      reason: absence.reason,
      reportedAt: absence.createdAt,
    }));
  }

  async findPlannedAbsence(
    sessionId: string,
    athleteId: string,
  ): Promise<PlannedAbsenceRecord | null> {
    const absence = await this.prisma.db.plannedAbsence.findUnique({
      where: { trainingSessionId_athleteId: { trainingSessionId: sessionId, athleteId } },
      select: {
        id: true,
        athleteId: true,
        reason: true,
        createdAt: true,
        athlete: { select: { firstName: true, lastName: true } },
      },
    });

    if (!absence) {
      return null;
    }

    return {
      id: absence.id,
      athleteId: absence.athleteId,
      athleteName: `${absence.athlete.lastName} ${absence.athlete.firstName}`,
      reason: absence.reason,
      reportedAt: absence.createdAt,
    };
  }

  async upsertPlannedAbsence(input: {
    sessionId: string;
    athleteId: string;
    reason: string | null;
    reportedById: string;
  }): Promise<PlannedAbsenceRecord> {
    const absence = await this.prisma.db.plannedAbsence.upsert({
      where: {
        trainingSessionId_athleteId: {
          trainingSessionId: input.sessionId,
          athleteId: input.athleteId,
        },
      },
      create: {
        trainingSessionId: input.sessionId,
        athleteId: input.athleteId,
        reason: input.reason,
        reportedById: input.reportedById,
      },
      update: { reason: input.reason, reportedById: input.reportedById },
      select: {
        id: true,
        athleteId: true,
        reason: true,
        createdAt: true,
        athlete: { select: { firstName: true, lastName: true } },
      },
    });

    return {
      id: absence.id,
      athleteId: absence.athleteId,
      athleteName: `${absence.athlete.lastName} ${absence.athlete.firstName}`,
      reason: absence.reason,
      reportedAt: absence.createdAt,
    };
  }

  async deletePlannedAbsence(sessionId: string, athleteId: string): Promise<boolean> {
    const result = await this.prisma.db.plannedAbsence.deleteMany({
      where: { trainingSessionId: sessionId, athleteId },
    });
    return result.count > 0;
  }
}

function toAttendanceRecord(mark: {
  athleteId: string;
  status: AttendanceStatus;
  comment: string | null;
  markedAt: Date;
  markedById: string | null;
}): AttendanceRecord {
  return {
    athleteId: mark.athleteId,
    status: mark.status,
    comment: mark.comment,
    markedAt: mark.markedAt,
    markedById: mark.markedById,
  };
}
