import Link from 'next/link';

import {
  addDays,
  byStart,
  type CalendarEvent,
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
  /** Куда ведут стрелки и переключатель, например `/schedule`. */
  baseHref: string;
  /** Компактный режим для Обзора: без кнопок и переключателя. */
  compact?: boolean;
}

/**
 * Календарь расписания: месяц или неделя (#72).
 *
 * Оба вида — один компонент: данные те же, отличается раскладка. Переключение
 * через query-параметры, чтобы календарь оставался серверным и не тянул
 * клиентский JS ради двух кнопок.
 */
export function ScheduleCalendar({
  events,
  view,
  anchor,
  baseHref,
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

  return (
    <section className="rounded-card border border-line bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink capitalize">{title}</h2>

        {compact ? null : (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Link
                className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-canvas"
                href={`${baseHref}?view=${view}&anchor=${previousAnchor(anchor, view)}`}
              >
                ‹
              </Link>
              <Link
                className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-canvas"
                href={`${baseHref}?view=${view}&anchor=${nextAnchor(anchor, view)}`}
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
                href={`${baseHref}?view=month&anchor=${anchor}`}
              >
                Месяц
              </Link>
              <Link
                className={
                  view === 'week'
                    ? 'bg-accent px-3 py-1 text-white'
                    : 'px-3 py-1 text-muted hover:bg-canvas'
                }
                href={`${baseHref}?view=week&anchor=${anchor}`}
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-xs">
        <thead>
          <tr className="border-b border-line text-muted">
            {(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const).map(
              (day) => (
                <th className="px-2 py-2 text-left font-medium" key={day}>
                  {WEEKDAY_LABELS[day]}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {grid.map((week) => (
            <tr className="border-b border-line last:border-0" key={week[0]}>
              {week.map((date) => {
                const inMonth = date >= from && date <= to;
                const events = byDate.get(date) ?? [];
                const visible = compact ? events.slice(0, 2) : events.slice(0, 3);
                const hidden = events.length - visible.length;

                return (
                  <td
                    className={
                      inMonth
                        ? 'align-top border-r border-line px-2 py-2 last:border-r-0'
                        : 'align-top border-r border-line bg-canvas/60 px-2 py-2 text-muted last:border-r-0'
                    }
                    key={date}
                  >
                    <div className="mb-1 text-xs text-muted">{Number(date.slice(8))}</div>
                    <ul className="flex flex-col gap-1">
                      {visible.map((event) => (
                        <li key={event.id}>
                          <Link
                            className={
                              event.kind === 'draft'
                                ? 'block rounded border border-dashed border-amber-300 bg-amber-50 px-1.5 py-1 text-[11px] text-amber-900 hover:border-amber-400'
                                : 'block rounded border border-line px-1.5 py-1 text-[11px] text-ink hover:border-accent'
                            }
                            href={event.href}
                            title={`${event.title} · ${event.startTime}–${event.endTime}`}
                          >
                            <span className="font-medium">{event.startTime}</span> {event.title}
                            {event.hallName ? (
                              <span className="block text-[10px] text-muted">
                                {event.hallName}
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      ))}
                      {hidden > 0 ? (
                        <li className="text-[10px] text-muted">ещё {hidden}</li>
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
      <div className="grid min-w-[720px] grid-cols-7">
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
                    <Link
                      className={
                        event.kind === 'draft'
                          ? 'block rounded border border-dashed border-amber-300 bg-amber-50 px-1.5 py-1 text-[11px] text-amber-900'
                          : 'block rounded border border-line px-1.5 py-1 text-[11px] text-ink hover:border-accent'
                      }
                      href={event.href}
                    >
                      <span className="font-medium">{event.startTime}</span>
                      <span className="block">{event.title}</span>
                      {event.trainerName ? (
                        <span className="block text-[10px] text-muted">{event.trainerName}</span>
                      ) : null}
                    </Link>
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
