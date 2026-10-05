import {
  datesForWeekday,
  intervalsOverlap,
  isoWeekday,
  localToUtc,
  minutesToTime,
  parseCalendarDate,
  quarterRange,
  slotOccurrences,
  timeToMinutes,
  utcToLocalDate,
  utcToLocalTime,
  zoneOffsetMinutes,
} from './club-calendar';

/**
 * Календарные расчёты расписания.
 *
 * Проверяется то, где легко ошибиться молча: границы кварталов, день недели по
 * ISO-8601, перевод локального времени клуба в UTC и поведение на смене
 * летнего времени.
 */

/** Дата в формате YYYY-MM-DD: в тестах строки сравниваются как есть. */
function formatDate(date: { year: number; month: number; day: number } | undefined): string {
  if (!date) {
    return '(нет)';
  }
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}
describe('quarterRange', () => {
  it('определяет границы каждого квартала', () => {
    expect(quarterRange(2026, 1)).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(quarterRange(2026, 2)).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(quarterRange(2026, 3)).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(quarterRange(2026, 4)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
  });

  it('учитывает високосный год в первом квартале', () => {
    expect(quarterRange(2028, 1)).toEqual({ from: '2028-01-01', to: '2028-03-31' });
    // 2024 — високосный, февраль заканчивается 29-м.
    expect(quarterRange(2024, 1).to).toBe('2024-03-31');
  });

  it('отклоняет некорректный номер квартала', () => {
    expect(() => quarterRange(2026, 0)).toThrow();
    expect(() => quarterRange(2026, 5)).toThrow();
    expect(() => quarterRange(2026, 1.5)).toThrow();
  });
});

describe('isoWeekday', () => {
  it('считает неделю с понедельника', () => {
    // 2026-01-05 — понедельник.
    expect(isoWeekday(2026, 1, 5)).toBe('MONDAY');
    expect(isoWeekday(2026, 1, 11)).toBe('SUNDAY');
  });

  it('возвращает воскресенье, а не «нулевой» день', () => {
    expect(isoWeekday(2026, 3, 1)).toBe('SUNDAY');
  });
});

describe('время', () => {
  it('переводит HH:mm в минуты и обратно', () => {
    expect(timeToMinutes('18:30')).toBe(1110);
    expect(minutesToTime(1110)).toBe('18:30');
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(1439)).toBe('23:59');
  });

  it('отклоняет некорректное время', () => {
    expect(() => timeToMinutes('24:00')).toThrow();
    expect(() => timeToMinutes('18:60')).toThrow();
    expect(() => timeToMinutes('18')).toThrow();
  });

  it('разбирает календарную дату', () => {
    expect(parseCalendarDate('2026-09-01')).toEqual({ year: 2026, month: 9, day: 1 });
    expect(() => parseCalendarDate('01.09.2026')).toThrow();
  });
});

describe('datesForWeekday', () => {
  it('находит все среды квартала', () => {
    const dates = datesForWeekday(quarterRange(2026, 1), 'WEDNESDAY');

    // 2026-01-07 — первая среда года; 2026-03-25 — последняя: следующая среда
    // 2026-04-01 выходит за границу квартала. Сред в квартале 12: по 4 в каждом
    // месяце, потому что квартал начинается в четверг.
    expect(dates[0]).toEqual({ year: 2026, month: 1, day: 7 });
    expect(dates[dates.length - 1]).toEqual({ year: 2026, month: 3, day: 25 });
    expect(dates).toHaveLength(12);
  });

  it('возвращает дни строго по возрастанию с шагом в неделю', () => {
    const dates = datesForWeekday(quarterRange(2026, 1), 'WEDNESDAY');

    for (let index = 1; index < dates.length; index += 1) {
      const previous = dates[index - 1];
      const current = dates[index];
      const gap =
        Date.UTC(current?.year ?? 0, (current?.month ?? 1) - 1, current?.day ?? 1) -
        Date.UTC(previous?.year ?? 0, (previous?.month ?? 1) - 1, previous?.day ?? 1);
      expect(gap).toBe(7 * 86_400_000);
    }
  });

  it('не выходит за границы квартала', () => {
    const dates = datesForWeekday(quarterRange(2026, 2), 'MONDAY');
    const first = dates[0];
    const last = dates[dates.length - 1];

    expect(formatDate(first)).toBe('2026-04-06');
    // Последний понедельник квартала — 2026-06-29: 30 июня это вторник.
    expect(formatDate(last)).toBe('2026-06-29');
  });

  it('возвращает пустой список, если день недели не встречается в коротком диапазоне', () => {
    // Один день — вторник.
    expect(datesForWeekday({ from: '2026-01-06', to: '2026-01-06' }, 'MONDAY')).toEqual([]);
    expect(datesForWeekday({ from: '2026-01-06', to: '2026-01-06' }, 'TUESDAY')).toHaveLength(1);
  });
});

describe('часовой пояс клуба', () => {
  it('определяет смещение зоны', () => {
    // Алматы: UTC+5 круглый год.
    expect(zoneOffsetMinutes(new Date('2026-07-01T00:00:00Z'), 'Asia/Almaty')).toBe(300);
    expect(zoneOffsetMinutes(new Date('2026-01-15T00:00:00Z'), 'Asia/Almaty')).toBe(300);
  });

  it('переводит локальное время клуба в UTC', () => {
    // 18:00 в Алматы = 13:00 UTC.
    const utc = localToUtc(
      { year: 2026, month: 9, day: 2, hour: 18, minute: 0 },
      'Asia/Almaty',
    );
    expect(utc.toISOString()).toBe('2026-09-02T13:00:00.000Z');
  });

  it('учитывает летнее время в зоне, где оно есть', () => {
    // Берлин: зимой UTC+1, летом UTC+2.
    const winter = localToUtc({ year: 2026, month: 1, day: 15, hour: 10, minute: 0 }, 'Europe/Berlin');
    const summer = localToUtc({ year: 2026, month: 7, day: 15, hour: 10, minute: 0 }, 'Europe/Berlin');

    expect(winter.toISOString()).toBe('2026-01-15T09:00:00.000Z');
    expect(summer.toISOString()).toBe('2026-07-15T08:00:00.000Z');
  });

  it('не сдвигает занятие через границу перехода времени', () => {
    // 29 марта 2026 — переход на летнее время в Берлине (02:00 → 03:00).
    // Занятие в 10:00 должно остаться в 10:00 по местному времени.
    const before = localToUtc({ year: 2026, month: 3, day: 28, hour: 10, minute: 0 }, 'Europe/Berlin');
    const after = localToUtc({ year: 2026, month: 3, day: 30, hour: 10, minute: 0 }, 'Europe/Berlin');

    expect(utcToLocalTime(before, 'Europe/Berlin')).toBe('10:00');
    expect(utcToLocalTime(after, 'Europe/Berlin')).toBe('10:00');
    // Смещение изменилось — значит проверка действительно про переход.
    expect(zoneOffsetMinutes(before, 'Europe/Berlin')).toBe(60);
    expect(zoneOffsetMinutes(after, 'Europe/Berlin')).toBe(120);
  });

  it('отдает локальную дату и время момента', () => {
    const instant = new Date('2026-09-02T13:00:00.000Z');

    expect(utcToLocalTime(instant, 'Asia/Almaty')).toBe('18:00');
    expect(utcToLocalDate(instant, 'Asia/Almaty')).toBe('2026-09-02');
  });

  it('переводит полночь без сдвига на предыдущий день', () => {
    const utc = localToUtc({ year: 2026, month: 9, day: 2, hour: 0, minute: 0 }, 'Asia/Almaty');

    expect(utc.toISOString()).toBe('2026-09-01T19:00:00.000Z');
    expect(utcToLocalDate(utc, 'Asia/Almaty')).toBe('2026-09-02');
    expect(utcToLocalTime(utc, 'Asia/Almaty')).toBe('00:00');
  });
});

describe('slotOccurrences', () => {
  it('создает занятие на каждый подходящий день квартала', () => {
    const occurrences = slotOccurrences(
      quarterRange(2026, 1),
      { weekday: 'WEDNESDAY', startTime: '18:00', endTime: '19:30' },
      'Asia/Almaty',
    );

    expect(occurrences).toHaveLength(12);
    expect(occurrences[0]?.startsAt.toISOString()).toBe('2026-01-07T13:00:00.000Z');
    expect(occurrences[0]?.endsAt.toISOString()).toBe('2026-01-07T14:30:00.000Z');
  });

  it('поддерживает занятие через полночь', () => {
    const occurrences = slotOccurrences(
      { from: '2026-01-07', to: '2026-01-07' },
      { weekday: 'WEDNESDAY', startTime: '22:00', endTime: '00:30' },
      'Asia/Almaty',
    );

    expect(occurrences).toHaveLength(1);
    // 22:00 Алматы = 17:00 UTC; длительность 2.5 часа.
    expect(occurrences[0]?.startsAt.toISOString()).toBe('2026-01-07T17:00:00.000Z');
    expect(occurrences[0]?.endsAt.toISOString()).toBe('2026-01-07T19:30:00.000Z');
  });

  it('сохраняет локальное время занятия при переходе на летнее время', () => {
    const occurrences = slotOccurrences(
      { from: '2026-03-25', to: '2026-04-01' },
      { weekday: 'WEDNESDAY', startTime: '10:00', endTime: '11:00' },
      'Europe/Berlin',
    );

    expect(occurrences.length).toBeGreaterThan(0);
    for (const occurrence of occurrences) {
      expect(utcToLocalTime(occurrence.startsAt, 'Europe/Berlin')).toBe('10:00');
    }
  });
});

describe('intervalsOverlap', () => {
  it('считает касание границ непересечением', () => {
    expect(intervalsOverlap({ start: 0, end: 60 }, { start: 60, end: 120 })).toBe(false);
    expect(intervalsOverlap({ start: 0, end: 61 }, { start: 60, end: 120 })).toBe(true);
  });

  it('видит вложенный интервал', () => {
    expect(intervalsOverlap({ start: 0, end: 120 }, { start: 30, end: 60 })).toBe(true);
  });
});
