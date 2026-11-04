'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { clubTime } from '@/lib/schedule/calendar';

export interface WeekEvent {
  id: string;
  groupName: string;
  hallId: string | null;
  hallName: string | null;
  trainerName: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
}

export interface WeekHall {
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

/** Локальная дата без времени — ключ дня для группировки. */
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}



function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfWeek(date: Date): Date {
  const day = date.getUTCDay();
  const shift = day === 0 ? -6 : 1 - day;
  return addDays(date, shift);
}

/**
 * Расписание OCTAGON Control 2.0 (#129).
 *
 * Десктоп: недельная сетка «зал × день» — основной режим. Мобильный: дневной
 * режим с переключателем дат; уменьшать недельную таблицу до 390 px нельзя.
 * Отменённые и перенесённые занятия помечены цветом и подписью статуса.
 */
export function ScheduleWeek({
  events,
  halls,
  anchor,
  today,
}: {
  events: readonly WeekEvent[];
  halls: readonly WeekHall[];
  anchor: string;
  today: string;
}) {
  const from = useMemo(() => startOfWeek(new Date(`${anchor}T00:00:00.000Z`)), [anchor]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(from, index)),
    [from],
  );
  const [selected, setSelected] = useState(() => {
    const todayDate = new Date(`${today}T00:00:00.000Z`);
    const inWeek = days.some((day) => dayKey(day.toISOString()) === dayKey(todayDate.toISOString()));
    return dayKey((inWeek ? todayDate : days[0]).toISOString());
  });

  const byHall = useMemo(() => {
    const map = new Map<string, Map<string, WeekEvent[]>>();
    for (const event of events) {
      const hall = event.hallId ?? 'none';
      const key = dayKey(event.startsAt);
      if (!map.has(hall)) {
        map.set(hall, new Map());
      }
      const hallMap = map.get(hall) ?? new Map<string, WeekEvent[]>();
      map.set(hall, hallMap);
      if (!hallMap.has(key)) {
        hallMap.set(key, []);
      }
      const dayList = hallMap.get(key) ?? [];
      hallMap.set(key, dayList);
      dayList.push(event);
    }
    for (const hallMap of map.values()) {
      for (const list of hallMap.values()) {
        list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      }
    }
    return map;
  }, [events]);

  const hallList = halls.length > 0 ? halls : [{ id: 'none', name: 'Без зала' }];

  function lessonClass(status: string): string {
    if (status === 'CANCELLED') {
      return 'border-danger bg-danger/5 text-danger line-through';
    }
    if (status === 'MOVED') {
      return 'border-warning bg-accent-soft text-accent-text';
    }
    return 'border-accent bg-accent-soft text-ink';
  }

  // --- мобильный дневной режим ---
  const selectedEvents = events
    .filter((event) => dayKey(event.startsAt) === selected)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const selectedGroups = new Map<string, WeekEvent[]>();
  for (const event of selectedEvents) {
    const key = event.hallId ?? 'none';
    if (!selectedGroups.has(key)) {
      selectedGroups.set(key, []);
    }
    selectedGroups.get(key)!.push(event);
  }

  return (
    <div>
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
                const key = dayKey(day.toISOString());
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
                          <span className="block text-[10px]">{STATUS_LABEL[event.status] ?? event.status}</span>
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
            href={`/schedule?anchor=${dayKey(addDays(from, -7).toISOString())}`}
            className="flex h-11 w-9 items-center justify-center rounded-control border border-line bg-white text-muted"
          >
            ‹
          </Link>
          <span className="flex-1 text-[14px] font-semibold text-ink">
            {String(from.getUTCDate()).padStart(2, '0')} — {String(days[6].getUTCDate()).padStart(2, '0')} {from.toLocaleString('ru-RU', { month: 'long', timeZone: 'UTC' })}
          </span>
          <Link
            aria-label="Следующая неделя"
            href={`/schedule?anchor=${dayKey(addDays(from, 7).toISOString())}`}
            className="flex h-11 w-9 items-center justify-center rounded-control border border-line bg-white text-muted"
          >
            ›
          </Link>
        </div>

        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
          {days.map((day, index) => {
            const key = dayKey(day.toISOString());
            const active = key === selected;
            const count = events.filter((event) => dayKey(event.startsAt) === key).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                className={`flex-none rounded-control border px-2 py-1.5 text-center text-[10.5px] leading-tight ${
                  active
                    ? 'border-accent bg-accent text-white'
                    : 'border-line bg-white text-muted'
                }`}
              >
                {DAY_LABELS[index]}
                <span className={`mt-0.5 block text-[14px] font-semibold ${active ? 'text-white' : 'text-ink'}`}>
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
              <section key={hall.id} className="mt-3 rounded-card border border-line bg-white px-3 py-2.5">
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
                      <span className="block text-[13px] font-medium text-ink">{event.groupName}</span>
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
    </div>
  );
}
