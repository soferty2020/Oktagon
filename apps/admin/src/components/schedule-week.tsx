'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { clubDate, clubTime } from '@/lib/schedule/calendar';

export interface CalendarEvent {
  id: string;
  groupName: string;
  hallId: string | null;
  hallName: string | null;
  trainerName: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
}

export interface CalendarHall {
  id: string;
  name: string;
}

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'запланировано',
  MOVED: 'перенесено',
  CANCELLED: 'отменено',
  COMPLETED: 'проведено',
};

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfWeek(date: Date): Date {
  const day = date.getUTCDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function lessonClass(status: string): string {
  if (status === 'CANCELLED') {
    return 'border-danger bg-danger/5 text-danger line-through';
  }
  if (status === 'MOVED') {
    return 'border-warning bg-accent-soft text-accent-text';
  }
  return 'border-accent bg-accent-soft text-ink';
}

/**
 * Расписание OCTAGON Control 2.0 (#129, #UAT).
 *
 * Неделя — основной режим: сетка «зал × день». Месяц — дополнительный обзор:
 * компактная сетка с числом занятий по дням, без тяжёлого календаря. Мобильный
 * остаётся дневным режимом с переключателем дат.
 */
export function ScheduleWeek({
  events,
  halls,
  anchor,
  today,
}: {
  events: readonly CalendarEvent[];
  halls: readonly CalendarHall[];
  anchor: string;
  today: string;
}) {
  const [view, setView] = useState<'week' | 'month'>('week');

  const from = useMemo(() => startOfWeek(new Date(`${anchor}T00:00:00.000Z`)), [anchor]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(from, index)),
    [from],
  );

  const monthStart = useMemo(() => startOfMonth(new Date(`${anchor}T00:00:00.000Z`)), [anchor]);
  const monthDays = useMemo(() => {
    const last = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
    return Array.from({ length: last.getUTCDate() }, (_, index) => addDays(monthStart, index));
  }, [monthStart]);

  const [selected, setSelected] = useState(() => {
    const todayDate = new Date(`${today}T00:00:00.000Z`);
    const inWeek = days.some((day) => clubDate(day.toISOString()) === clubDate(todayDate.toISOString()));
    return clubDate((inWeek ? todayDate : days[0]).toISOString());
  });

  const byHall = useMemo(() => {
    const map = new Map<string, Map<string, CalendarEvent[]>>();
    for (const event of events) {
      const hall = event.hallId ?? 'none';
      if (!map.has(hall)) {
        map.set(hall, new Map());
      }
      const hallMap = map.get(hall) as Map<string, CalendarEvent[]>;
      const key = clubDate(event.startsAt);
      const dayList = hallMap.get(key) ?? [];
      dayList.push(event);
      hallMap.set(key, dayList);
    }
    for (const hallMap of map.values()) {
      for (const list of hallMap.values()) {
        list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      }
    }
    return map;
  }, [events]);

  const countByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of events) {
      const key = clubDate(event.startsAt);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [events]);

  const hallList = halls.length > 0 ? halls : [{ id: 'none', name: 'Без зала' }];

  const selectedEvents = events
    .filter((event) => clubDate(event.startsAt) === selected)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const selectedGroups = new Map<string, CalendarEvent[]>();
  for (const event of selectedEvents) {
    const key = event.hallId ?? 'none';
    const list = selectedGroups.get(key) ?? [];
    list.push(event);
    selectedGroups.set(key, list);
  }

  return (
    <div>
      {/* Переключатель режима: неделя — основной, месяц — обзор. */}
      <div className="mb-3 flex items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-control border border-line">
          <button
            type="button"
            onClick={() => setView('week')}
            className={
              view === 'week'
                ? 'h-9 bg-accent px-3 text-[12.5px] text-white'
                : 'h-9 bg-white px-3 text-[12.5px] text-muted'
            }
          >
            Неделя
          </button>
          <button
            type="button"
            onClick={() => setView('month')}
            className={
              view === 'month'
                ? 'h-9 bg-accent px-3 text-[12.5px] text-white'
                : 'h-9 bg-white px-3 text-[12.5px] text-muted'
            }
          >
            Месяц
          </button>
        </div>
        <span className="text-[12px] text-muted">
          {view === 'week' ? 'Занятия по залам на неделю' : 'Обзор месяца: сколько занятий в день'}
        </span>
      </div>

      {/* Месяц: компактный обзор, клик по дню открывает его в дневном режиме. */}
      {view === 'month' ? (
        <div className="overflow-hidden rounded-card border border-line bg-white">
          <div className="grid grid-cols-7">
            {DAY_LABELS.map((label) => (
              <div
                key={label}
                className="border-b border-r border-line bg-[#fbfbfc] px-2 py-1.5 text-[11px] text-muted last:border-r-0"
              >
                {label}
              </div>
            ))}
            {Array.from({ length: (monthStart.getUTCDay() + 6) % 7 }, (_, index) => `pad-${index}`).map(
              (padKey) => (
                <div
                  key={padKey}
                  className="min-h-[62px] border-b border-r border-line bg-[#fcfcfd]"
                />
              ),
            )}
            {monthDays.map((day) => {
              const key = clubDate(day.toISOString());
              const count = countByDay.get(key) ?? 0;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelected(key);
                    setView('week');
                  }}
                  className="min-h-[62px] border-b border-r border-line p-1.5 text-left last:border-r-0 hover:bg-accent-soft/40"
                >
                  <span className="block text-[12px] font-medium text-ink">
                    {String(day.getUTCDate()).padStart(2, '0')}
                  </span>
                  {count > 0 ? (
                    <span className="mt-1 block text-[11px] text-accent-text">{count} зан.</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          {/* Десктоп: недельная сетка */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-white md:block">
            <div className="grid grid-cols-[150px_repeat(7,minmax(0,1fr))]">
              <div className="border-b border-r border-line bg-[#fbfbfc] px-3 py-2 text-[11.5px] text-muted">
                Зал
              </div>
              {days.map((day, index) => (
                <div
                  key={day.toISOString()}
                  className={`border-b border-r border-line bg-[#fbfbfc] px-2.5 py-2 text-[11.5px] last:border-r-0 ${
                    index === 6 ? 'text-accent-text' : 'text-muted'
                  }`}
                >
                  {DAY_LABELS[index]}
                  <span className="mt-0.5 block text-[13px] font-semibold text-ink">
                    {String(day.getUTCDate()).padStart(2, '0')}
                  </span>
                </div>
              ))}

              {hallList.map((hall) => (
                <div key={hall.id} className="contents">
                  <div className="border-b border-r border-line px-3 py-3 text-[12.5px] font-medium text-ink">
                    {hall.name}
                  </div>
                  {days.map((day, dayIndex) => {
                    const key = clubDate(day.toISOString());
                    const list = byHall.get(hall.id)?.get(key) ?? [];
                    return (
                      <div
                        key={`${hall.id}-${key}`}
                        className={`flex min-h-[104px] flex-col gap-1.5 border-b border-r border-line p-1.5 last:border-r-0 ${
                          dayIndex === 6 ? 'bg-warm/40' : ''
                        }`}
                      >
                        {list.map((event) => (
                          <Link
                            key={event.id}
                            href={`/schedule/sessions/${event.id}/attendance`}
                            className={`block rounded-lg border-l-[3px] px-1.5 py-1 text-[11px] leading-tight ${lessonClass(event.status)}`}
                          >
                            <span className="block font-semibold">{clubTime(event.startsAt)}</span>
                            <span className="block truncate">{event.groupName}</span>
                            {event.status !== 'SCHEDULED' ? (
                              <span className="block text-[10px]">
                                {STATUS_LABEL[event.status] ?? event.status}
                              </span>
                            ) : null}
                          </Link>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Мобильный: дневной режим */}
          <div className="md:hidden">
            <div className="flex items-center gap-2">
              <Link
                aria-label="Предыдущая неделя"
                href={`/schedule?anchor=${clubDate(addDays(from, -7).toISOString())}`}
                className="flex h-11 w-9 items-center justify-center rounded-control border border-line bg-white text-muted"
              >
                ‹
              </Link>
              <span className="flex-1 text-[14px] font-semibold text-ink">
                {String(from.getUTCDate()).padStart(2, '0')} —{' '}
                {String(days[6].getUTCDate()).padStart(2, '0')}{' '}
                {from.toLocaleString('ru-RU', { month: 'long', timeZone: 'UTC' })}
              </span>
              <Link
                aria-label="Следующая неделя"
                href={`/schedule?anchor=${clubDate(addDays(from, 7).toISOString())}`}
                className="flex h-11 w-9 items-center justify-center rounded-control border border-line bg-white text-muted"
              >
                ›
              </Link>
            </div>

            <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
              {days.map((day, index) => {
                const key = clubDate(day.toISOString());
                const active = key === selected;
                const count = countByDay.get(key) ?? 0;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(key)}
                    className={`flex-none rounded-control border px-2 py-1.5 text-center text-[10.5px] leading-tight ${
                      active ? 'border-accent bg-accent text-white' : 'border-line bg-white text-muted'
                    }`}
                  >
                    {DAY_LABELS[index]}
                    <span
                      className={`mt-0.5 block text-[14px] font-semibold ${active ? 'text-white' : 'text-ink'}`}
                    >
                      {String(day.getUTCDate()).padStart(2, '0')}
                    </span>
                    {count > 0 ? <span className="block text-[9.5px]">{count}</span> : null}
                  </button>
                );
              })}
            </div>

            {selectedEvents.length === 0 ? (
              <p className="mt-4 rounded-card border border-line bg-white px-4 py-8 text-center text-[13px] text-muted">
                На этот день занятий нет.
              </p>
            ) : (
              hallList
                .filter((hall) => selectedGroups.has(hall.id))
                .map((hall) => (
                  <section
                    key={hall.id}
                    className="mt-3 rounded-card border border-line bg-white px-3 py-2.5"
                  >
                    <h3 className="mb-1 flex items-center justify-between text-[13px] font-semibold text-ink">
                      {hall.name}
                      <span className="text-[11.5px] font-normal text-muted">
                        {selectedGroups.get(hall.id)?.length ?? 0}
                      </span>
                    </h3>
                    {(selectedGroups.get(hall.id) ?? []).map((event) => (
                      <Link
                        key={event.id}
                        href={`/schedule/sessions/${event.id}/attendance`}
                        className="flex gap-2.5 border-t border-line py-2 first:border-t-0"
                      >
                        <span className="w-10 flex-none text-[12.5px] font-semibold text-ink">
                          {clubTime(event.startsAt)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-ink">
                            {event.groupName}
                          </span>
                          <span className="block text-[11.5px] text-muted">
                            {event.trainerName ?? 'тренер не назначен'}
                          </span>
                        </span>
                        <span
                          className={`h-fit flex-none rounded-full px-2 py-0.5 text-[11px] ${
                            event.status === 'CANCELLED'
                              ? 'bg-canvas text-muted'
                              : event.status === 'MOVED'
                                ? 'bg-accent-soft text-accent-text'
                                : 'bg-success/10 text-success'
                          }`}
                        >
                          {STATUS_LABEL[event.status] ?? event.status}
                        </span>
                      </Link>
                    ))}
                  </section>
                ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
