import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CLUB_TIMEZONE, clubDate, clubTime, startOfWeek, todayInClub } from './calendar.ts';

/**
 * Часовой пояс клуба (#UAT п.1).
 *
 * Расписание показывает время занятий и даты в одном поясе — `CLUB_TIMEZONE`.
 * Раньше сетка использовала зашитый `Asia/Novosibirsk`, и занятия на странице
 * «Группы» (18:00) и в недельной сетке (13:00) расходились. Тест фиксирует, что
 * время и дата считаются в поясе клуба, включая переход через границу суток.
 */
test('clubTime переводит UTC в пояс клуба', () => {
  // 11:00 UTC = 17:00 в Алматы (UTC+6) / 18:00 в Новосибирске (UTC+7).
  const iso = '2026-11-03T11:00:00.000Z';
  const expected = new Intl.DateTimeFormat('ru-RU', {
    timeZone: CLUB_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));

  assert.equal(clubTime(iso), expected);
});

test('clubDate на границе суток относит занятие к дате клуба, а не UTC', () => {
  // 20:00 UTC — это уже следующие сутки в поясах UTC+3…UTC+14.
  const lateUtc = '2026-11-03T20:00:00.000Z';
  const clubDay = clubDate(lateUtc);
  const utcDay = lateUtc.slice(0, 10);

  const offsetMinutes = Number(
    new Intl.DateTimeFormat('en', { timeZone: CLUB_TIMEZONE, timeZoneName: 'longOffset' })
      .formatToParts(new Date(lateUtc))
      .find((part) => part.type === 'timeZoneName')
      ?.value.replace('GMT', '')
      .replace(':', '') ?? '0',
  );

  if (offsetMinutes > 0) {
    assert.notEqual(clubDay, utcDay, 'занятие вечером UTC должно попасть на следующую дату клуба');
  } else {
    assert.equal(clubDay, utcDay);
  }
});

test('startOfWeek всегда даёт понедельник', () => {
  for (const day of ['2026-11-02', '2026-11-08', '2026-11-04']) {
    const monday = startOfWeek(day);
    const weekday = new Date(`${monday}T00:00:00.000Z`).getUTCDay();
    assert.equal(weekday, 1, `${day} → ${monday} должен быть понедельником`);
  }
});

test('todayInClub возвращает дату клуба в формате YYYY-MM-DD', () => {
  assert.match(todayInClub(), /^\d{4}-\d{2}-\d{2}$/);
});
