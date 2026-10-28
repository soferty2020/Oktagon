import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  type AthleteAttendanceHistoryEntry,
  type AthleteAttendanceSummary,
  type ReportPlannedAbsenceInput,
  type SaveAttendanceInput,
  type SessionAttendanceView,
  type SessionRosterEntry,
} from '@octagon/contracts';

import { AttendanceStatus as PrismaAttendanceStatus } from '../../../generated/prisma';
import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { GroupsRepository } from '../groups/groups.repository';
import { ResourceScopeService } from '../identity/resource-scope.service';
// Обычный импорт, не `import type`: репозиторий — DI-токен, его значение должно
// попасть в метаданные конструктора (emitDecoratorMetadata).
import { AttendanceRepository } from './attendance.repository';
import type { AttendanceRecord, SessionRecord } from './attendance.repository';

/**
 * Посещаемость (эпик E).
 *
 * Спецификация: BR-008 (родитель сообщает о планируемом отсутствии — это
 * предварительная информация, итог подтверждает тренер), docs/22-erd.md
 * (Attendance, PlannedAbsence), docs/01-mvp-scope.md.
 *
 * Ключевое правило: список на занятие строится по составу группы **на дату
 * занятия**. Иначе спортсмену, зачисленному в середине квартала, приписали бы
 * отсутствия за занятия, которых не было в его расписании, а выбывшему —
 * отсутствия после ухода.
 */
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly attendance: AttendanceRepository,
    private readonly groups: GroupsRepository,
    private readonly scope: ResourceScopeService,
    private readonly audit: AuditService,
  ) {}

  /** Список на занятие: состав группы на дату, отметки и предупреждения. */
  async getSessionAttendance(
    callerUserId: string,
    sessionId: string,
  ): Promise<SessionAttendanceView> {
    const session = await this.requireSession(sessionId);
    await this.scope.assertGroupAccess(callerUserId, session.groupId);

    return this.buildView(session, callerUserId);
  }

  /**
   * Сохраняет отметки.
   *
   * Отметка идемпотентна: повторная запись обновляет статус, а не создает
   * вторую. Тренер исправляет ошибку в журнале, а не «дописывает» посещение.
   */
  async saveAttendance(
    callerUserId: string,
    sessionId: string,
    input: SaveAttendanceInput,
  ): Promise<SessionAttendanceView> {
    const session = await this.requireSession(sessionId);
    await this.scope.assertGroupAccess(callerUserId, session.groupId);

    if (input.marks.length === 0) {
      return this.buildView(session, callerUserId);
    }

    const roster = await this.groups.listRosterAsOf(session.groupId, session.startsAt);
    const rosterIds = new Set(roster.map((member) => member.athleteId));

    const created: string[] = [];
    const updated: string[] = [];

    for (const mark of input.marks) {
      if (!rosterIds.has(mark.athleteId)) {
        throw new ApiException(
          'ATHLETE_NOT_IN_GROUP' satisfies ApiErrorCode,
          'Спортсмен не числился в группе на дату занятия: отмечать его нельзя',
          { athleteId: mark.athleteId },
        );
      }

      const existing = await this.attendance.findAttendance(sessionId, mark.athleteId);
      await this.attendance.upsertAttendance({
        sessionId,
        athleteId: mark.athleteId,
        status: mark.status as PrismaAttendanceStatus,
        comment: mark.comment ?? null,
        markedById: callerUserId,
      });

      if (existing) {
        updated.push(mark.athleteId);
      } else {
        created.push(mark.athleteId);
      }
    }

    await this.audit.recordSafely({
      action: created.length > 0 ? AuditAction.ATTENDANCE_MARKED : AuditAction.ATTENDANCE_UPDATED,
      entityType: AuditEntityType.ATTENDANCE,
      entityId: sessionId,
      after: {
        created: created.length,
        updated: updated.length,
        statuses: input.marks.map((mark) => ({ athleteId: mark.athleteId, status: mark.status })),
      },
    });

    this.logger.log(
      `Посещаемость занятия ${sessionId}: новых ${created.length}, изменено ${updated.length}`,
    );

    return this.buildView(session, callerUserId);
  }

  /** Снимает отметку: спортсмена могли отметить по ошибке. */
  async resetAttendance(
    callerUserId: string,
    sessionId: string,
    athleteId: string,
  ): Promise<SessionAttendanceView> {
    const session = await this.requireSession(sessionId);
    await this.scope.assertGroupAccess(callerUserId, session.groupId);

    const removed = await this.attendance.deleteAttendance(sessionId, athleteId);
    if (!removed) {
      throw new ApiException(
        'ATTENDANCE_NOT_FOUND' satisfies ApiErrorCode,
        'Отметка для этого спортсмена не найдена',
      );
    }

    await this.audit.recordSafely({
      action: AuditAction.ATTENDANCE_UPDATED,
      entityType: AuditEntityType.ATTENDANCE,
      entityId: sessionId,
      before: { athleteId, reset: true },
    });

    return this.buildView(session, callerUserId);
  }

  /** Родитель сообщает о планируемом отсутствии (BR-008). */
  async reportPlannedAbsence(
    callerUserId: string,
    sessionId: string,
    input: ReportPlannedAbsenceInput,
  ): Promise<SessionAttendanceView> {
    const session = await this.requireSession(sessionId);
    // Проверка scope: родитель может сообщать только о своих спортсменах, а
    // сотрудник — только о тех, кто в его зоне видимости.
    await this.scope.assertAthleteAccess(callerUserId, input.athleteId);

    const roster = await this.groups.listRosterAsOf(session.groupId, session.startsAt);
    if (!roster.some((member) => member.athleteId === input.athleteId)) {
      throw new ApiException(
        'ATHLETE_NOT_IN_GROUP' satisfies ApiErrorCode,
        'Спортсмен не числился в группе на дату занятия',
        { athleteId: input.athleteId },
      );
    }

    await this.attendance.upsertPlannedAbsence({
      sessionId,
      athleteId: input.athleteId,
      reason: input.reason ?? null,
      reportedById: callerUserId,
    });

    await this.audit.recordSafely({
      action: AuditAction.PLANNED_ABSENCE_REPORTED,
      entityType: AuditEntityType.PLANNED_ABSENCE,
      entityId: sessionId,
      after: { athleteId: input.athleteId },
    });

    return this.buildView(session, callerUserId);
  }

  /** Отменяет предупреждение об отсутствии: спортсмен придет. */
  async cancelPlannedAbsence(
    callerUserId: string,
    sessionId: string,
    athleteId: string,
  ): Promise<SessionAttendanceView> {
    const session = await this.requireSession(sessionId);
    await this.scope.assertAthleteAccess(callerUserId, athleteId);

    const removed = await this.attendance.deletePlannedAbsence(sessionId, athleteId);
    if (!removed) {
      throw new ApiException(
        'PLANNED_ABSENCE_NOT_FOUND' satisfies ApiErrorCode,
        'Предупреждение об отсутствии не найдено',
      );
    }

    await this.audit.recordSafely({
      action: AuditAction.PLANNED_ABSENCE_CANCELLED,
      entityType: AuditEntityType.PLANNED_ABSENCE,
      entityId: sessionId,
      before: { athleteId },
    });

    return this.buildView(session, callerUserId);
  }

  /**
   * Сводка посещаемости группы за период.
   *
   * Знаменатель — занятия, на которых спортсмен числился в составе: иначе
   * процент посещаемости был бы занижен у тех, кто зачислен позже остальных.
   */
  async summary(
    callerUserId: string,
    groupId: string,
    from: Date,
    to: Date,
  ): Promise<AthleteAttendanceSummary[]> {
    await this.scope.assertGroupAccess(callerUserId, groupId);

    const sessionIds = await this.attendance.listSessionIds(groupId, from, to);
    if (sessionIds.length === 0) {
      return [];
    }

    const sessions = await Promise.all(
      sessionIds.map((sessionId) => this.attendance.findSession(sessionId)),
    );
    const marks = await this.attendance.listAttendanceForSessions(sessionIds);

    // Ключ — пара «занятие + спортсмен»: по одному спортсмену статус
    // размножился бы на все занятия периода.
    const markIndex = new Map(
      marks.map((mark) => [`${mark.sessionId}|${mark.athleteId}`, mark]),
    );

    const totals = new Map<string, AthleteAttendanceSummary>();
    const ensure = (athleteId: string): AthleteAttendanceSummary => {
      const existing = totals.get(athleteId);
      if (existing) {
        return existing;
      }
      const fresh: AthleteAttendanceSummary = {
        athleteId,
        total: 0,
        present: 0,
        absent: 0,
        excused: 0,
        unmarked: 0,
      };
      totals.set(athleteId, fresh);
      return fresh;
    };

    for (const [index, sessionId] of sessionIds.entries()) {
      const session = sessions[index];
      if (!session) {
        continue;
      }

      const roster = await this.groups.listRosterAsOf(groupId, session.startsAt);
      for (const member of roster) {
        const summary = ensure(member.athleteId);
        summary.total += 1;

        const mark = markIndex.get(`${sessionId}|${member.athleteId}`);
        if (!mark) {
          summary.unmarked += 1;
        } else if (mark.status === PrismaAttendanceStatus.PRESENT) {
          summary.present += 1;
        } else if (mark.status === PrismaAttendanceStatus.ABSENT) {
          summary.absent += 1;
        } else {
          summary.excused += 1;
        }
      }
    }

    return [...totals.values()].sort(
      (a, b) => b.total - a.total || a.athleteId.localeCompare(b.athleteId),
    );
  }

  // --- Вспомогательное -----------------------------------------------------

  private async buildView(
    session: SessionRecord,
    callerUserId: string,
  ): Promise<SessionAttendanceView> {
    const [roster, marks, absences] = await Promise.all([
      this.groups.listRosterAsOf(session.groupId, session.startsAt),
      this.attendance.listAttendance(session.id),
      this.attendance.listPlannedAbsences(session.id),
    ]);

    // Родитель видит только своих детей (#50): roster всей группы раскрывал
    // имена и статусы чужих. Тренер и админ ограничений не получают.
    const visible = await this.scope.visibleAthleteIds(callerUserId);
    const allowedRoster =
      visible === null
        ? roster
        : roster.filter((member) => visible.includes(member.athleteId));

    const marksByAthlete = new Map(marks.map((mark) => [mark.athleteId, mark]));
    const absencesByAthlete = new Map(absences.map((absence) => [absence.athleteId, absence]));

    const entries: SessionRosterEntry[] = allowedRoster.map((member) => {
      const mark = marksByAthlete.get(member.athleteId);
      const absence = absencesByAthlete.get(member.athleteId);

      return {
        athleteId: member.athleteId,
        firstName: member.firstName,
        lastName: member.lastName,
        attendance: mark ? toMarkView(mark) : null,
        plannedAbsence: absence
          ? { reason: absence.reason, reportedAt: absence.reportedAt.toISOString() }
          : null,
      };
    });

    return {
      sessionId: session.id,
      groupId: session.groupId,
      groupName: session.groupName,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      status: session.status,
      roster: entries,
      markedCount: entries.filter((entry) => entry.attendance !== null).length,
    };
  }

  private async requireSession(sessionId: string): Promise<SessionRecord> {
    const session = await this.attendance.findSession(sessionId);
    if (!session) {
      throw new ApiException(
        'TRAINING_SESSION_NOT_FOUND' satisfies ApiErrorCode,
        'Занятие не найдено',
      );
    }
    return session;
  }

  /**
   * История посещений спортсмена за период.
   *
   * Отвечает на вопрос «был ли ребенок 12 ноября», на который сводка не отвечает:
   * она отдает только суммы. Доступ проверяется тем же `assertAthleteAccess`, что
   * и у остальных операций с посещаемостью: родитель видит своего ребенка, тренер
   * — спортсменов своих групп (ADR-0006).
   */
  async history(
    callerUserId: string,
    athleteId: string,
    from: Date,
    to: Date,
  ): Promise<AthleteAttendanceHistoryEntry[]> {
    await this.scope.assertAthleteAccess(callerUserId, athleteId);

    const entries = await this.attendance.listAthleteAttendance(athleteId, from, to);

    return entries.map((entry) => ({
      sessionId: entry.sessionId,
      groupId: entry.groupId,
      groupName: entry.groupName,
      startsAt: entry.startsAt.toISOString(),
      status: entry.status,
      comment: entry.comment,
      markedAt: entry.markedAt.toISOString(),
    }));
  }
}

function toMarkView(mark: AttendanceRecord) {
  return {
    athleteId: mark.athleteId,
    status: mark.status,
    comment: mark.comment,
    markedAt: mark.markedAt.toISOString(),
    markedById: mark.markedById,
  };
}
