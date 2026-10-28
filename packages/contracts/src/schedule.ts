/**
 * Контракт расписания (эпик D).
 *
 * Спецификация: docs/22-erd.md (ScheduleTemplate, ScheduleTemplateSlot,
 * TrainingSession), BR-009 (точечное изменение экземпляра не меняет
 * квартальный шаблон), docs/08-database.md (расчётный период хранится
 * календарными полями year/quarter, а не выводится из UTC-timestamps).
 *
 * Ключевое разделение: шаблон описывает регулярность на квартал, а занятие —
 * конкретный экземпляр с датой и временем. Правка экземпляра не должна менять
 * шаблон, иначе одно перенесённое занятие переписало бы всё расписание.
 */

import type { CalendarPeriod } from './transport';
import type { Weekday } from './domain';

/** Дни недели уже описаны в домене (`Weekday`), здесь только подписи. */
export const WEEKDAY_LABELS: Readonly<Record<Weekday, string>> = {
  MONDAY: 'Понедельник',
  TUESDAY: 'Вторник',
  WEDNESDAY: 'Среда',
  THURSDAY: 'Четверг',
  FRIDAY: 'Пятница',
  SATURDAY: 'Суббота',
  SUNDAY: 'Воскресенье',
};

/** Порядок дней для вывода расписания: неделя начинается с понедельника. */
export const WEEKDAY_ORDER: readonly Weekday[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

/** Статус экземпляра занятия (BR-009). */
export const TrainingSessionStatus = {
  SCHEDULED: 'SCHEDULED',
  CANCELLED: 'CANCELLED',
  MOVED: 'MOVED',
} as const;
export type TrainingSessionStatus =
  (typeof TrainingSessionStatus)[keyof typeof TrainingSessionStatus];

/** Квартал года: `year` плюс `quarter` 1..4 (transport.CalendarPeriod). */
export type QuarterPeriod = CalendarPeriod & { quarter: number };

export interface ScheduleSlotView {
  id: string;
  weekday: Weekday;
  /** Время начала в формате HH:mm. */
  startTime: string;
  endTime: string;
  hallId: string | null;
  hallName: string | null;
  trainerId: string | null;
  trainerName: string | null;
}

export interface ScheduleTemplateView {
  id: string;
  groupId: string;
  groupName: string;
  year: number;
  quarter: number;
  validFrom: string;
  validTo: string;
  publishedAt: string | null;
  slots: ScheduleSlotView[];
}

/**
 * Экземпляр занятия.
 *
 * `hallId`, `trainerId` и `branchId` скопированы из шаблона при материализации:
 * если тренер позже сменится в шаблоне, уже созданные занятия не поедут
 * (BR-009). Поэтому в карточке занятия они показываются как есть.
 */
export interface TrainingSessionView {
  id: string;
  groupId: string;
  groupName: string;
  hallId: string | null;
  hallName: string | null;
  trainerId: string | null;
  trainerName: string | null;
  /** UTC-время начала в ISO-8601. */
  startsAt: string;
  endsAt: string;
  status: TrainingSessionStatus;
  changeReason: string | null;
  cancelledAt: string | null;
  /** Занятие создано из шаблона либо добавлено вручную. */
  fromTemplate: boolean;
}

export interface CreateScheduleTemplateInput {
  groupId: string;
  year: number;
  /** 1..4 */
  quarter: number;
}

export interface AddScheduleSlotInput {
  weekday: Weekday;
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
  hallId?: string | null;
  trainerId?: string | null;
}

export interface UpdateScheduleSlotInput {
  weekday?: Weekday;
  startTime?: string;
  endTime?: string;
  hallId?: string | null;
  trainerId?: string | null;
}

export interface GenerateSessionsInput {
  templateId: string;
  /**
   * Пересоздать уже materialized занятия. Распространяется только на занятия,
   * которые еще не начались и не отменены вручную.
   */
  regenerate?: boolean;
}

export interface GenerateSessionsResult {
  created: number;
  skipped: number;
  /** Занятия, удаленные при пересоздании (еще не начавшиеся). */
  removed: number;
  /**
   * Пересечения по залу или тренеру (#72).
   *
   * Общая тренировка — обычное дело: две группы в одном зале в одно время.
   * Поэтому это предупреждение, а не ошибка: занятия создаются, но накладку
   * видно сразу, а не после жалобы родителя.
   */
  warnings: string[];
}

/**
 * Занятие, добавленное вручную.
 *
 * Нужно для двух случаев: занести занятие задним числом (клуб перешел на систему
 * позже, чем начал работать) и добавить разовое занятие вне квартального
 * расписания. Такое занятие не связано с шаблоном, поэтому `fromTemplate` у него
 * false, и пересоздание расписания его не затрагивает.
 *
 * Время задается локальным временем клуба: администратор вводит «7 октября
 * 18:00», а не UTC.
 */
export interface CreateSessionInput {
  groupId: string;
  /** Календарная дата, YYYY-MM-DD. */
  date: string;
  /** Локальное время начала, HH:mm. */
  startTime: string;
  /** Локальное время окончания, HH:mm; допускается переход через полночь. */
  endTime: string;
  hallId?: string | null;
  trainerId?: string | null;
  /** Зачем добавлено занятие: попадает в карточку занятия. */
  reason: string;
}

export interface ListSessionsQuery {
  /** Начало периода в ISO-8601; включительно. */
  from?: string;
  /** Конец периода в ISO-8601; исключительно. */
  to?: string;
  groupId?: string;
  trainerId?: string;
  status?: TrainingSessionStatus;
}

export interface MoveSessionInput {
  /** Новое начало в ISO-8601 (UTC). */
  startsAt: string;
  /** Новое окончание в ISO-8601 (UTC). */
  endsAt: string;
  hallId?: string | null;
  trainerId?: string | null;
  /** Причина переноса: попадает в карточку занятия (BR-009). */
  reason: string;
}

export interface CancelSessionInput {
  reason: string;
}
