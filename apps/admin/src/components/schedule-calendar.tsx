import Link from 'next/link';

import {
  addDays,
  byStart,
  type CalendarEvent,
  groupColor,
  monthGrid,
  monthRange,
  startOfWeek,
  WEEKDAY_LABELS,
  weekdayOf,
} from '@/lib/schedule/calendar';

export type CalendarView = 'month' | 'week';

const MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

interface ScheduleCalendarProps {
  events: CalendarEvent[];
  view: CalendarView;
  /** Любая дата внутри показываемого месяца или недели. */
  anchor: string;
  /** Куда ведут стрелки и переключатель. */
  baseHref: string;
  /** Фильтры, которые нужно сохранить в ссылках навигации. */
  keepParams?: Record<string, string | undefined>;
  /** Компактный режим для Обзора: без кнопок и переключателя. */
  compact?: boolean;
}

/**
 * Календарь расписания: месяц или неделя (#72).
 *
 * Каждая группа получает свой цвет: в сетке видно, где чья группа, без чтения
 * подписей. Цвет стабилен — он считается из идентификатора группы.
 */
export function ScheduleCalendar({
  events,
  view,
  anchor,
  baseHref,
  keepParams = {},
  compact = false,
}: ScheduleCalendarProps) {
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const list = byDate.get(event.date) ?? [];
    list.push(event);
    byDate.set(event.date, list);
  }
  for (const list of byDate.values()) {
    list.sort(byStart);
  }

  const [year, month] = anchor.split('-').map(Number);
  const title =
    view === 'month'
      ? `${MONTHS[(month ?? 1) - 1]} ${year}`
      : `${startOfWeek(anchor).slice(8)}–${addDays(startOfWeek(anchor), 6).slice(8)} ${MONTHS[(month ?? 1) - 1]}`;

  const withParams = (params: Record<string, string>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...keepParams, ...params })) {
      if (value) {
        query.set(key, value);
      }
    }
    return `${baseHref}?${query.toString()}`;
  };

  return (
    <section className="rounded-card border border-line bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink capitalize">{title}</h2>

        {compact ? null : (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Link
                className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-canvas"
                href={withParams({ view, anchor: previousAnchor(anchor, view) })}
              >
                ‹
              </Link>
              <Link
                className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-canvas"
                href={withParams({ view, anchor: nextAnchor(anchor, view) })}
              >
                ›
              </Link>
            </div>
            <div className="flex overflow-hidden rounded-md border border-line text-xs">
              <Link
                className={
                  view === 'month'
                    ? 'bg-accent px-3 py-1 text-white'
                    : 'px-3 py-1 text-muted hover:bg-canvas'
                }
                href={withParams({ view: 'month', anchor })}
              >
                Месяц
              </Link>
              <Link
                className={
                  view === 'week'
                    ? 'bg-accent px-3 py-1 text-white'
                    : 'px-3 py-1 text-muted hover:bg-canvas'
                }
                href={withParams({ view: 'week', anchor })}
              >
                Неделя
              </Link>
            </div>
          </div>
        )}
      </header>

      {view === 'month' ? (
        <MonthGrid anchor={anchor} byDate={byDate} compact={compact} />
      ) : (
        <WeekGrid anchor={anchor} byDate={byDate} />
      )}
    </section>
  );
}

function MonthGrid({
  anchor,
  byDate,
  compact,
}: {
  anchor: string;
  byDate: Map<string, CalendarEvent[]>;
  compact: boolean;
}) {
  const [year, month] = anchor.split('-').map(Number);
  const { from, to } = monthRange(year ?? 2026, month ?? 1);
  const grid = monthGrid(year ?? 2026, month ?? 1);
  const weekdays = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
  ] as const;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] table-fixed border-collapse text-xs">
        <thead>
          <tr className="border-b border-line text-muted">
            {weekdays.map((day) => (
              <th className="px-2 py-2 text-center font-medium" key={day}>
                {WEEKDAY_LABELS[day]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((week) => (
            <tr className="border-b border-line last:border-0" key={week[0]}>
              {week.map((date, index) => {
                const inMonth = date >= from && date <= to;
                const events = byDate.get(date) ?? [];
                const visible = compact ? events.slice(0, 2) : events;
                const hidden = events.length - visible.length;
                const isWeekend = index >= 5;

                return (
                  <td
                    className={`align-top border-r border-line px-1.5 py-1.5 last:border-r-0 ${
                      inMonth ? '' : 'bg-canvas/50 text-muted'
                    } ${isWeekend && inMonth ? 'bg-[#FBF7F2]' : ''}`}
                    key={date}
                  >
                    <div className="mb-1 px-1 text-[11px] text-muted">
                      {Number(date.slice(8))}
                    </div>
                    <ul className="flex flex-col gap-1">
                      {visible.map((event) => (
                        <li key={event.id}>
                          <EventCard event={event} />
                        </li>
                      ))}
                      {hidden > 0 ? (
                        <li className="px-1 text-[10px] text-muted">ещё {hidden}</li>
                      ) : null}
                    </ul>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeekGrid({
  anchor,
  byDate,
}: {
  anchor: string;
  byDate: Map<string, CalendarEvent[]>;
}) {
  const monday = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[820px] grid-cols-7">
        {days.map((date) => {
          const events = byDate.get(date) ?? [];

          return (
            <div className="border-r border-line px-2 py-3 last:border-r-0" key={date}>
              <div className="mb-2">
                <div className="text-xs text-muted">{WEEKDAY_LABELS[weekdayOf(date)]}</div>
                <div className="text-sm font-medium text-ink">{Number(date.slice(8))}</div>
              </div>
              <ul className="flex flex-col gap-1">
                {events.map((event) => (
                  <li key={event.id}>
                    <EventCard event={event} />
                  </li>
                ))}
                {events.length === 0 ? (
                  <li className="text-[10px] text-muted">—</li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Карточка занятия в сетке: цвет группы, время, название, зал. */
function EventCard({ event }: { event: CalendarEvent }) {
  const color = groupColor(event.groupId);

  return (
    <Link
      className="block rounded-md border px-1.5 py-1 hover:brightness-[0.98]"
      href={event.href}
      style={{
        backgroundColor: event.kind === 'draft' ? '#FFFFFF' : color.bg,
        borderColor: color.border,
        borderStyle: event.kind === 'draft' ? 'dashed' : 'solid',
      }}
      title={`${event.title} · ${event.startTime}–${event.endTime}`}
    >
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color.dot }}
        />
        <span className="text-[11px] font-semibold" style={{ color: color.text }}>
          {event.startTime}
        </span>
        <span className="truncate text-[11px] text-ink">{event.title}</span>
      </span>
      {event.hallName ? (
        <span className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted">
          <svg
            aria-hidden
            className="h-2.5 w-2.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            viewBox="0 0 24 24"
          >
            <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          {event.hallName}
        </span>
      ) : null}
    </Link>
  );
}

function nextAnchor(anchor: string, view: CalendarView): string {
  if (view === 'week') {
    return addDays(anchor, 7);
  }

  const [year, month] = anchor.split('-').map(Number);
  const next = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1 + 1, 1));
  return next.toISOString().slice(0, 10);
}

function previousAnchor(anchor: string, view: CalendarView): string {
  if (view === 'week') {
    return addDays(anchor, -7);
  }

  const [year, month] = anchor.split('-').map(Number);
  const previous = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1 - 1, 1));
  return previous.toISOString().slice(0, 10);
}
