/**
 * Календарь расписания: месяцы, недели и разворачивание слотов.
 *
 * Живет в админке, а не в API: это представление, а не правило. API отдает
 * занятия и шаблоны, а как их разложить по дням — дело экрана.
 */

/** Часовой пояс клуба: в нем тренер и родитель видят время. */
export const CLUB_TIMEZONE = process.env.CLUB_TIMEZONE ?? 'Asia/Almaty';

const WEEKDAY_BY_INDEX = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

export type WeekdayName = (typeof WEEKDAY_BY_INDEX)[number];

export const WEEKDAY_LABELS: Record<WeekdayName, string> = {
  MONDAY: 'Пн',
  TUESDAY: 'Вт',
  WEDNESDAY: 'Ср',
  THURSDAY: 'Чт',
  FRIDAY: 'Пт',
  SATURDAY: 'Сб',
  SUNDAY: 'Вс',
};

/** Событие календаря: занятие или слот черновика. */
export interface CalendarEvent {
  id: string;
  kind: 'session' | 'draft';
  /** Дата в поясе клуба, YYYY-MM-DD. */
  date: string;
  /** Время в поясе клуба, HH:mm. */
  startTime: string;
  endTime: string;
  title: string;
  groupId: string | null;
  hallId: string | null;
  hallName: string | null;
  trainerId: string | null;
  trainerName: string | null;
  status: string | null;
  href: string;
}

/** Шаблон в том виде, в котором его отдает API. */
export interface TemplateForCalendar {
  id: string;
  groupId: string;
  groupName: string;
  validFrom: string;
  validTo: string;
  publishedAt: string | null;
  slots: {
    id: string;
    weekday: string;
    startTime: string;
    endTime: string;
    hallId: string | null;
    hallName: string | null;
    trainerId: string | null;
    trainerName: string | null;
  }[];
}

/**
 * Цвет группы для календаря.
 *
 * Цвет — не украшение: по нему в сетке видно, где чья группа. Берется из
 * фиксированной палитры по идентификатору, поэтому у группы он не меняется
 * между загрузками страницы.
 */
const GROUP_COLORS = [
  { bg: '#FFF1E3', border: '#FFB26B', text: '#B4550A', dot: '#FF7A00' },
  { bg: '#EAF1FF', border: '#9DBBFF', text: '#1E4FA3', dot: '#2F6FEB' },
  { bg: '#E8F7EE', border: '#9ADBB4', text: '#1B6B3D', dot: '#2E9E5B' },
  { bg: '#F1ECFF', border: '#C3B2FF', text: '#4A2FA3', dot: '#7C4DFF' },
  { bg: '#FDECEC', border: '#F2A9A9', text: '#9B1C1C', dot: '#E5484D' },
  { bg: '#E6F6F6', border: '#9CD9D9', text: '#0B5F5F', dot: '#00A3A3' },
] as const;

export type GroupColor = (typeof GROUP_COLORS)[number];

export function groupColor(groupId: string | null | undefined): GroupColor {
  if (!groupId) {
    return GROUP_COLORS[0];
  }

  let hash = 0;
  for (const char of groupId) {
    hash = (hash * 31 + char.charCodeAt(0)) % 997;
  }

  return GROUP_COLORS[hash % GROUP_COLORS.length] ?? GROUP_COLORS[0];
}

/** Дата в поясе клуба как `YYYY-MM-DD`. */
export function clubDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));

  // en-CA дает YYYY-MM-DD — ровно то, что нужно для ключа дня.
  return parts;
}

/** Время в поясе клуба как `HH:mm`. */
export function clubTime(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: CLUB_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/** `YYYY-MM-DD` без сдвигов: дата уже в поясе клуба. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const base = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Понедельник недели, в которую попадает дата. */
export function startOfWeek(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const base = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  // getUTCDay: 0 — воскресенье. Понедельник — начало недели клуба.
  const offset = (base.getUTCDay() + 6) % 7;
  base.setUTCDate(base.getUTCDate() - offset);
  return base.toISOString().slice(0, 10);
}

/** Сегодня в поясе клуба. */
export function todayInClub(): string {
  return clubDate(new Date().toISOString());
}

/** Первый и последний день месяца. */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from, to: `${year}-${String(month).padStart(2, '0')}-${lastDay}` };
}

/**
 * Сетка месяца по неделям, начиная с понедельника.
 *
 * В сетку попадают и «хвосты» соседних месяцев: иначе первая неделя выглядела
 * бы обрезанной.
 */
export function monthGrid(year: number, month: number): string[][] {
  const { from, to } = monthRange(year, month);
  const gridStart = startOfWeek(from);
  const weeks: string[][] = [];
  let cursor = gridStart;

  while (cursor <= to || weeks.length === 0) {
    const week = Array.from({ length: 7 }, (_, index) => addDays(cursor, index));
    weeks.push(week);
    cursor = addDays(cursor, 7);

    // Месяц занимает 5 или 6 недель: больше не нужно.
    if (weeks.length >= 6) {
      break;
    }
    if (cursor > to && weeks.length >= 5) {
      break;
    }
  }

  return weeks;
}

/** День недели даты как имя контракта (`MONDAY`). */
export function weekdayOf(date: string): WeekdayName {
  const [year, month, day] = date.split('-').map(Number);
  const base = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  return WEEKDAY_BY_INDEX[base.getUTCDay()] ?? 'MONDAY';
}

/**
 * Слоты шаблонов, развернутые в даты периода.
 *
 * Календарь показывает регулярность, а не материализованные занятия: слот
 * повторяется каждую неделю, и по нему видно, как выглядит расписание группы.
 * Черновик отличается пометкой: пока шаблон не опубликован, занятий нет, но
 * планировщику нужно видеть, что получится (#72).
 */
export function expandTemplateSlots(
  templates: TemplateForCalendar[],
  from: string,
  to: string,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const template of templates) {
    const kind = template.publishedAt ? 'session' : 'draft';

    for (const slot of template.slots) {
      for (let date = from; date <= to; date = addDays(date, 1)) {
        if (date < template.validFrom || date > template.validTo) {
          continue;
        }
        if (weekdayOf(date) !== slot.weekday) {
          continue;
        }

        events.push({
          id: `${template.id}-${slot.id}-${date}`,
          kind,
          date,
          startTime: slot.startTime.slice(0, 5),
          endTime: slot.endTime.slice(0, 5),
          title: template.groupName,
          groupId: template.groupId,
          hallId: slot.hallId,
          hallName: slot.hallName,
          trainerId: slot.trainerId,
          trainerName: slot.trainerName,
          status: template.publishedAt ? null : 'черновик',
          href: `/schedule/${template.id}`,
        });
      }
    }
  }

  return events;
}

/** Сравнение событий для порядка внутри дня. */
export function byStart(left: CalendarEvent, right: CalendarEvent): number {
  return left.startTime.localeCompare(right.startTime);
}
