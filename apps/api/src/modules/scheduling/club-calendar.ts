/**
 * Календарные расчёты расписания.
 *
 * Спецификация: docs/08-database.md (расчётный период хранится календарными
 * полями, а не выводится из UTC-timestamps), docs/14-infrastructure.md
 * (CLUB_TIMEZONE), BR-009.
 *
 * Почему это отдельный модуль: расписание задается «по средам в 18:00» — это
 * локальное настенное время клуба, а в базу попадает UTC. Если считать
 * смещение через UTC-методы Date, то на смене летнего времени занятие
 * сдвинется на час относительно расписания. Здесь конвертация локального
 * времени в UTC идет через Intl и не зависит от часового пояса процесса.
 */

import type { Weekday } from '@octagon/contracts';

export interface LocalDateTime {
  year: number;
  /** 1..12 */
  month: number;
  /** 1..31 */
  day: number;
  hour: number;
  minute: number;
}

export interface QuarterRange {
  /** Календарная дата начала, YYYY-MM-DD. */
  from: string;
  /** Календарная дата конца, YYYY-MM-DD (включительно). */
  to: string;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/**
 * Номер дня недели по ISO-8601 (1 — понедельник … 7 — воскресенье).
 *
 * В контракте `Weekday` — строковый enum, как в схеме БД; для арифметики нужен
 * числовой индекс, поэтому перевод явный и в одном месте.
 */
const WEEKDAY_INDEX: Readonly<Record<Weekday, number>> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7,
};

const INDEX_WEEKDAY: Readonly<Record<number, Weekday>> = {
  1: 'MONDAY',
  2: 'TUESDAY',
  3: 'WEDNESDAY',
  4: 'THURSDAY',
  5: 'FRIDAY',
  6: 'SATURDAY',
  7: 'SUNDAY',
};

/** Форматтер кэшируется: создание Intl.DateTimeFormat дорогое. */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** Локальные поля даты для момента времени в заданной зоне. */
export function localParts(instant: Date, timeZone: string): Required<LocalDateTime> & {
  second: number;
} {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value ?? '0';
    return Number.parseInt(value, 10);
  };

  // en-US с hour12: false может отдать 24 для полуночи — приводим к 0.
  const hour = read('hour') % 24;

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second'),
  };
}

/** Смещение зоны в минутах для конкретного момента (UTC+5 → 300). */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = localParts(instant, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((asUtc - instant.getTime()) / MS_PER_MINUTE);
}

/**
 * Локальное настенное время клуба превращает в момент UTC.
 *
 * Смещение зависит от даты (летнее время), поэтому сначала берем смещение в
 * предположительном моменте, затем уточняем его в найденном — этого достаточно,
 * потому что переходы времени сдвигают часы на час, а не на произвольную
 * величину.
 */
export function localToUtc(local: LocalDateTime, timeZone: string): Date {
  const naiveUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const rounded = Math.round(naiveUtc / MS_PER_MINUTE) * MS_PER_MINUTE;
  const firstGuess = new Date(
    rounded - zoneOffsetMinutes(new Date(rounded), timeZone) * MS_PER_MINUTE,
  );
  const offset = zoneOffsetMinutes(firstGuess, timeZone);

  return new Date(rounded - offset * MS_PER_MINUTE);
}

/** Границы квартала календарными датами. */
export function quarterRange(year: number, quarter: number): QuarterRange {
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    throw new Error(`Квартал должен быть целым числом от 1 до 4, получено: ${quarter}`);
  }

  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  // День 0 следующего месяца — последний день текущего.
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();

  return {
    from: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    to: `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** Разбирает календарную дату YYYY-MM-DD в числовые поля. */
export function parseCalendarDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Ожидалась календарная дата YYYY-MM-DD, получено: ${value}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** День недели календарной даты. */
export function isoWeekday(year: number, month: number, day: number): Weekday {
  return INDEX_WEEKDAY[dayOfWeekIndex(year, month, day)] as Weekday;
}

function dayOfWeekIndex(year: number, month: number, day: number): number {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  // getUTCDay: 0 — воскресенье; ISO-8601 считает неделю с понедельника.
  return weekday === 0 ? 7 : weekday;
}

/** Разбирает время HH:mm. */
export function parseTime(value: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Ожидалось время HH:mm, получено: ${value}`);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new Error(`Некорректное время: ${value}`);
  }
  return { hour, minute };
}

/** Время в формате HH:mm по минутам от начала суток. */
export function minutesToTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Минуты от начала суток для времени HH:mm. */
export function timeToMinutes(value: string): number {
  const { hour, minute } = parseTime(value);
  return hour * 60 + minute;
}

/** Все календарные даты указанного дня недели внутри диапазона (включительно). */
export function datesForWeekday(
  range: QuarterRange,
  weekday: Weekday,
): { year: number; month: number; day: number }[] {
  const from = parseCalendarDate(range.from);
  const to = parseCalendarDate(range.to);
  const target = WEEKDAY_INDEX[weekday];

  const end = Date.UTC(to.year, to.month - 1, to.day);
  const dates: { year: number; month: number; day: number }[] = [];

  // Первый день нужного дня недели в диапазоне.
  let current = Date.UTC(from.year, from.month - 1, from.day);
  while (dayOfWeekIndexFromUtc(current) !== target) {
    current += MS_PER_DAY;
    if (current > end) {
      return dates;
    }
  }

  for (let day = current; day <= end; day += 7 * MS_PER_DAY) {
    const date = new Date(day);
    dates.push({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    });
  }

  return dates;
}

function dayOfWeekIndexFromUtc(utcMillis: number): number {
  const weekday = new Date(utcMillis).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/**
 * Моменты занятий для слота шаблона внутри квартала.
 *
 * Возвращает UTC-интервалы: локальное время слота в каждом подходящем дне
 * квартала, переведенное в UTC.
 */
export function slotOccurrences(
  range: QuarterRange,
  slot: { weekday: Weekday; startTime: string; endTime: string },
  timeZone: string,
): { startsAt: Date; endsAt: Date }[] {
  const start = parseTime(slot.startTime);
  const end = parseTime(slot.endTime);
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;

  return datesForWeekday(range, slot.weekday).map((date) => {
    // Занятие через полночь относится к начавшемуся дню: окончание считаем от
    // начала, а не как абсолютное время суток.
    const durationMinutes =
      endMinutes > startMinutes ? endMinutes - startMinutes : 24 * 60 - startMinutes + endMinutes;

    const startsAt = localToUtc(
      {
        year: date.year,
        month: date.month,
        day: date.day,
        hour: start.hour,
        minute: start.minute,
      },
      timeZone,
    );

    return { startsAt, endsAt: new Date(startsAt.getTime() + durationMinutes * MS_PER_MINUTE) };
  });
}

/** Пересекаются ли интервалы (касание границ пересечением не считается). */
export function intervalsOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Конвертирует момент UTC в строку локального времени HH:mm клуба. */
export function utcToLocalTime(instant: Date, timeZone: string): string {
  const parts = localParts(instant, timeZone);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

/** Календарная дата (YYYY-MM-DD) момента UTC в зоне клуба. */
export function utcToLocalDate(instant: Date, timeZone: string): string {
  const parts = localParts(instant, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
