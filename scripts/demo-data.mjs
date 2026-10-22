/**
 * Демонстрационные данные для визуального просмотра мобильного приложения.
 *
 * Создает участника клуба с известным паролем, спортсмена, группу, занятия и
 * объявления — чтобы экраны показывали реальные данные, а не пустые состояния.
 *
 * Скрипт лежит в `scripts/`, а не в `.tools/`: он нужен на любой машине после
 * клонирования, иначе демонстрацию пришлось бы собирать заново вручную.
 *
 * Требует запущенного API и `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` в
 * `apps/api/.env` (docs/27).
 *
 * Использование:
 *   node scripts/demo-data.mjs
 */
import { readFileSync } from 'node:fs';

const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';

const env = readFileSync(new URL('../apps/api/.env', import.meta.url), 'utf8');
const readEnv = (key) => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();
const superEmail = readEnv('SUPERADMIN_EMAIL');
const superPassword = readEnv('SUPERADMIN_PASSWORD');

if (!superEmail || !superPassword) {
  throw new Error('В apps/api/.env нет SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD');
}

async function api(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(
      `${method} ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`,
    );
  }
  return payload;
}

const stamp = Date.now();

// 1. Администратор: он создает все остальное.
const admin = await api('/auth/login', {
  method: 'POST',
  body: { email: superEmail, password: superPassword },
});
console.log('администратор вошел');

// 2. Участник клуба с известным паролем.
const memberEmail = `demo-parent-${stamp}@octagon.local`;
const memberPassword = 'Demo-Parent-2026!';

const invite = await api('/users/invites', {
  method: 'POST',
  body: { email: memberEmail, role: 'MEMBER' },
  token: admin.accessToken,
});

const member = await api('/auth/accept-invite', {
  method: 'POST',
  body: {
    token: invite.token,
    email: memberEmail,
    password: memberPassword,
    firstName: 'Алия',
    lastName: 'Демо',
  },
});
console.log(`участник создан: ${memberEmail}`);

// 3. Спортсмен и связь с аккаунтом.
const athlete = await api('/athletes', {
  method: 'POST',
  body: { firstName: 'Дамир', lastName: 'Демо', gender: 'MALE', birthDate: '2015-04-12' },
  token: admin.accessToken,
});

await api(`/athletes/${athlete.id}/accounts`, {
  method: 'POST',
  body: { userId: member.userId, relation: 'PARENT', isPrimary: true },
  token: admin.accessToken,
});
console.log('спортсмен создан и связан с аккаунтом');

// 4. Группа, тренер и состав.
const group = await api('/groups', {
  method: 'POST',
  body: { name: `Дети 7-9 (демо ${stamp})` },
  token: admin.accessToken,
});

const trainer = await api('/trainers', {
  method: 'POST',
  body: { displayName: 'Серик Тренеров', phone: '+7 700 000 00 00' },
  token: admin.accessToken,
});

await api(`/groups/${group.id}/trainers`, {
  method: 'POST',
  body: { trainerId: trainer.id },
  token: admin.accessToken,
});

await api(`/groups/${group.id}/members`, {
  method: 'POST',
  body: { athleteId: athlete.id },
  token: admin.accessToken,
});
console.log('группа и тренер подготовлены');

// 5. Занятия: прошедшее сегодня и три в будущем, чтобы работали и «ближайшая
// тренировка», и посещаемость за месяц.
//
// Прошедшее занятие именно сегодня: спортсмен вступил в группу только что, и
// отметить его на дату раньше вступления нельзя (ATHLETE_NOT_IN_GROUP) — это
// защита, а не помеха.
const day = (offset) => {
  const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
};

for (const [offset, start, end, reason] of [
  [0, '08:00', '09:00', 'Занятие для посещаемости'],
  [2, '18:00', '19:30', 'Регулярное занятие'],
  [4, '10:00', '11:30', 'Занятие выходного дня'],
  [7, '18:00', '19:30', 'Регулярное занятие'],
]) {
  const session = await api('/training-sessions', {
    method: 'POST',
    body: {
      groupId: group.id,
      date: day(offset),
      startTime: start,
      endTime: end,
      trainerId: trainer.id,
      reason,
    },
    token: admin.accessToken,
  });

  if (offset === 0) {
    await api(`/training-sessions/${session.id}/attendance`, {
      method: 'PUT',
      body: { marks: [{ athleteId: athlete.id, status: 'PRESENT' }] },
      token: admin.accessToken,
    });
  }
}
console.log('занятия и отметка посещаемости созданы');

// 6. Объявления: закрепленное и обычное.
await api('/news', {
  method: 'POST',
  body: {
    title: 'Расписание на ноябрь',
    body: 'Опубликовано расписание на ноябрь. Проверьте время тренировок в разделе «Расписание».',
    publish: true,
  },
  token: admin.accessToken,
});

await api('/news', {
  method: 'POST',
  body: {
    title: 'Турнир клуба 15 ноября',
    body: 'Открыта запись на внутренний турнир. Запись у администратора клуба.',
    publish: true,
  },
  token: admin.accessToken,
});
console.log('объявления опубликованы');

console.log('\n=== ДАННЫЕ ДЛЯ ВХОДА ===');
console.log(`email:    ${memberEmail}`);
console.log(`пароль:   ${memberPassword}`);
console.log(`админ:    ${superEmail}`);
