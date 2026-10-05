/**
 * Контракт посещаемости (эпик E).
 *
 * Спецификация: BR-008 (родитель сообщает о планируемом отсутствии — это
 * предварительная информация, итоговую посещаемость подтверждает
 * тренер/администратор), docs/22-erd.md (Attendance, PlannedAbsence),
 * docs/01-mvp-scope.md (посещаемость входит в MVP).
 *
 * Ключевое разделение: `PlannedAbsence` — намерение родителя, `Attendance` —
 * подтвержденный тренером факт. Одно не заменяет другое, и смешивать их нельзя:
 * родитель может предупредить, но спортсмен в итоге придет.
 */

import type { AttendanceStatus } from './domain';

/** Итоговая посещаемость, подтвержденная тренером или администратором. */
export type { AttendanceStatus };

export const ATTENDANCE_LABELS: Readonly<Record<AttendanceStatus, string>> = {
  PRESENT: 'Присутствовал',
  ABSENT: 'Отсутствовал',
  EXCUSED: 'Отсутствовал по уважительной причине',
};

/** Отметка одного спортсмена. */
export interface AttendanceMarkView {
  athleteId: string;
  status: AttendanceStatus;
  comment: string | null;
  markedAt: string;
  markedById: string | null;
}

/**
 * Спортсмен в списке на занятие.
 *
 * Список строится по составу группы **на дату занятия**: спортсмен, зачисленный
 * позже, не должен числиться отсутствующим на занятии, которого еще не было в
 * его расписании, а выбывший — на последующих.
 */
export interface SessionRosterEntry {
  athleteId: string;
  firstName: string;
  lastName: string;
  /** Подтвержденная отметка, если тренер уже отмечал. */
  attendance: AttendanceMarkView | null;
  /** Предупреждение родителя о планируемом отсутствии (BR-008). */
  plannedAbsence: {
    reason: string | null;
    reportedAt: string;
  } | null;
}

export interface SessionAttendanceView {
  sessionId: string;
  groupId: string;
  groupName: string;
  /** Время занятия в UTC. */
  startsAt: string;
  endsAt: string;
  status: string;
  /** Спортсмены группы на дату занятия. */
  roster: SessionRosterEntry[];
  /** Сколько отметок уже подтверждено. */
  markedCount: number;
}

export interface SaveAttendanceInput {
  /**
   * Отметки для сохранения. Передаются только измененные спортсмены: тренер
   * отмечает по ходу занятия, а не заполняет весь список сразу.
   */
  marks: {
    athleteId: string;
    status: AttendanceStatus;
    comment?: string | null;
  }[];
}

export interface ReportPlannedAbsenceInput {
  athleteId: string;
  /** Причина для тренера; необязательна. */
  reason?: string | null;
}

export interface PlannedAbsenceView {
  id: string;
  sessionId: string;
  athleteId: string;
  athleteName: string;
  reason: string | null;
  reportedAt: string;
}

/** Сводка посещаемости спортсмена за период. */
export interface AthleteAttendanceSummary {
  athleteId: string;
  /** Всего занятий группы в периоде, где спортсмен числился в составе. */
  total: number;
  present: number;
  absent: number;
  excused: number;
  /** Занятия без подтвержденной отметки. */
  unmarked: number;
}
