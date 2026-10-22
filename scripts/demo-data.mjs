/**
 * Демонстрационные данные для просмотра мобильного приложения и админки.
 *
 * Создает осмысленный набор: филиал с залом, тренера, две группы с учениками,
 * расписание на неделю, отметку посещаемости, оплату и объявления. Без этого
 * экраны показывают пустые состояния, а проверять на них нечего.
 *
 * Запускается после очистки: `node scripts/reset-demo.mjs`.
 * Требует запущенного API и `SUPERADMIN_*` в `apps/api/.env`.
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
    throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return payload;
}

const stamp = Date.now();
const day = (offset) => {
  const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
};

// 1. Администратор: он создает все остальное.
const admin = await api('/auth/login', {
  method: 'POST',
  body: { email: superEmail, password: superPassword },
});
const token = admin.accessToken;
console.log('администратор вошел');

// 2. Филиал и зал: без филиала группа не привязывается, без зала занятие не
// получает место.
const branch = await api('/branches', {
  method: 'POST',
  body: { name: 'Главный филиал', address: 'ул. Абая, 1', phone: '+7 700 100 10 10' },
  token,
});

const hall = await api(`/branches/${branch.id}/halls`, {
  method: 'POST',
  // branchId в теле не передается: он приходит из адреса и запрещен в DTO.
  body: { name: 'Зал 1', capacity: 30 },
  token,
});
console.log('филиал и зал созданы');

// 3. Тренер.
const trainer = await api('/trainers', {
  method: 'POST',
  body: { displayName: 'Серик Тренеров', phone: '+7 700 200 20 20' },
  token,
});

// 4. Участник клуба с известным паролем.
const memberEmail = `demo-parent-${stamp}@octagon.local`;
const memberPassword = 'Demo-Parent-2026!';

const invite = await api('/users/invites', {
  method: 'POST',
  body: { email: memberEmail, role: 'MEMBER' },
  token,
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

// 5. Группы: младшая и старшая.
const junior = await api('/groups', {
  method: 'POST',
  body: { name: 'Дети 7-9, новички', description: 'Младшая группа, вт и чт' },
  token,
});
const senior = await api('/groups', {
  method: 'POST',
  body: { name: 'Дети 10-12', description: 'Старшая группа, пн и ср' },
  token,
});

for (const group of [junior, senior]) {
  await api(`/groups/${group.id}/branches`, {
    method: 'POST',
    body: { branchId: branch.id },
    token,
  });
  await api(`/groups/${group.id}/trainers`, {
    method: 'POST',
    body: { trainerId: trainer.id },
    token,
  });
}
console.log('группы созданы и привязаны');

// 6. Ученики. Первый связан с аккаунтом родителя — он и показывается в мобильном
// приложении.
const athletes = [
  { firstName: 'Дамир', lastName: 'Демо', gender: 'MALE', birthDate: '2015-04-12' },
  { firstName: 'Алия', lastName: 'Смирнова', gender: 'FEMALE', birthDate: '2016-06-03' },
  { firstName: 'Артём', lastName: 'Волков', gender: 'MALE', birthDate: '2015-11-20' },
  { firstName: 'София', lastName: 'Иванова', gender: 'FEMALE', birthDate: '2014-02-14' },
  { firstName: 'Иван', lastName: 'Лебедев', gender: 'MALE', birthDate: '2013-09-30' },
];

const created = [];
for (const [index, athlete] of athletes.entries()) {
  const record = await api('/athletes', { method: 'POST', body: athlete, token });
  created.push(record);

  const group = index < 3 ? junior : senior;
  await api(`/groups/${group.id}/members`, {
    method: 'POST',
    body: { athleteId: record.id },
    token,
  });
}

await api(`/athletes/${created[0].id}/accounts`, {
  method: 'POST',
  body: { userId: member.userId, relation: 'PARENT', isPrimary: true },
  token,
});
console.log(`ученики созданы: ${created.length}, Дамир связан с аккаунтом`);

// 7. Расписание: прошедшее занятие сегодня (для отметки) и занятия на неделю.
//
// Прошедшее занятие именно сегодня: спортсмен вступил в группу только что, и
// отметить его на дату раньше вступления нельзя (ATHLETE_NOT_IN_GROUP) — это
// защита, а не помеха.
const scheduled = [
  { group: junior, offset: 0, start: '08:00', end: '09:00', reason: 'Занятие для посещаемости' },
  { group: junior, offset: 2, start: '18:00', end: '19:30', reason: 'Регулярное занятие' },
  { group: junior, offset: 4, start: '10:00', end: '11:30', reason: 'Занятие выходного дня' },
  { group: junior, offset: 7, start: '18:00', end: '19:30', reason: 'Регулярное занятие' },
  { group: senior, offset: 1, start: '18:00', end: '19:30', reason: 'Регулярное занятие' },
  { group: senior, offset: 3, start: '18:00', end: '19:30', reason: 'Регулярное занятие' },
];

for (const slot of scheduled) {
  const session = await api('/training-sessions', {
    method: 'POST',
    body: {
      groupId: slot.group.id,
      date: day(slot.offset),
      startTime: slot.start,
      endTime: slot.end,
      trainerId: trainer.id,
      hallId: hall.id,
      reason: slot.reason,
    },
    token,
  });

  if (slot.offset === 0) {
    // Отметки на прошедшем: два пришли, один нет. Так на экране посещаемости
    // видно разные статусы, а не одна строка.
    await api(`/training-sessions/${session.id}/attendance`, {
      method: 'PUT',
      body: {
        marks: [
          { athleteId: created[0].id, status: 'PRESENT' },
          { athleteId: created[1].id, status: 'PRESENT' },
          { athleteId: created[2].id, status: 'ABSENT', comment: 'Предупредили заранее' },
        ],
      },
      token,
    });
  }
}
console.log('расписание и отметки созданы');

// 8. Оплата текущего месяца: без нее кольцо финансов в админке показывает ноль.
const now = new Date();
const period = await api(
  `/athletes/${created[0].id}/membership-periods/${now.getFullYear()}/${now.getMonth() + 1}`,
  { token },
);

await api(`/membership-periods/${period.id}/payments`, {
  method: 'POST',
  body: { amount: 45000, method: 'CASH', comment: 'Абонемент за месяц' },
  token,
});
console.log('оплата добавлена');

// 9. Объявления.
for (const post of [
  {
    title: 'Расписание на ноябрь',
    body: 'Опубликовано расписание на ноябрь. Проверьте время тренировок в разделе «Расписание».',
  },
  {
    title: 'Турнир клуба 15 ноября',
    body: 'Открыта запись на внутренний турнир. Запись у администратора клуба.',
  },
  {
    title: 'Открыт набор в младшую группу',
    body: 'Идет набор детей 7-9 лет. Первое занятие бесплатное.',
  },
]) {
  await api('/news', { method: 'POST', body: { ...post, publish: true }, token });
}
console.log('объявления опубликованы');

console.log('\n=== ДАННЫЕ ДЛЯ ВХОДА ===');
console.log(`участник: ${memberEmail} / ${memberPassword}`);
console.log(`админ:    ${superEmail}`);
