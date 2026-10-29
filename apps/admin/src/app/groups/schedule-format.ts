const WEEKDAY: Record<string, string> = {
  MONDAY: 'Пн',
  TUESDAY: 'Вт',
  WEDNESDAY: 'Ср',
  THURSDAY: 'Чт',
  FRIDAY: 'Пт',
  SATURDAY: 'Сб',
  SUNDAY: 'Вс',
};

/** «Пн, Ср, Пт, 18:00–19:30» из слотов шаблона; `null` — расписания нет. */
export function formatSchedule(
  slots: { weekday: string; start: string; end: string }[],
): string | null {
  if (slots.length === 0) {
    return null;
  }

  const days = [...new Set(slots.map((slot) => WEEKDAY[slot.weekday] ?? slot.weekday))].join(', ');
  return `${days}, ${slots[0].start}–${slots[0].end}`;
}
