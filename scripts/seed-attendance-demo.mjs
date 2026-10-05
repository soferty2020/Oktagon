/**
 * Готовит данные посещаемости для живой проверки админки.
 *
 * Создает группу с двумя спортсменами, расписание и занятия, затем отмечает
 * посещаемость и оставляет предупреждение об отсутствии, чтобы экран был
 * заполнен.
 *
 * Использование: node scripts/seed-attendance-demo.mjs [apiBaseUrl]
 */
const api = process.argv[2] ?? 'http://127.0.0.1:3900/api/v1';
const EMAIL = process.env.ADMIN_EMAIL ?? 'superadmin@octagon.local';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'ChangeMe-Octagon-2026!';

let token = '';
const stamp = Date.now();

async function call(method, path, body) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, body: payload };
}

async function main() {
  const login = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  token = login.body?.accessToken ?? '';
  if (!token) {
    throw new Error(`не удалось войти: ${login.status}`);
  }

  const now = new Date();
  const branch = await call('POST', '/branches', { name: `Филиал журнала ${stamp}` });
  const hall = await call('POST', `/branches/${branch.body.id}/halls`, {
    name: `Зал журнала ${stamp}`,
  });
  const trainer = await call('POST', '/trainers', { displayName: `Тренер журнала ${stamp}` });
  const group = await call('POST', '/groups', { name: `Группа журнала ${stamp}` });
  await call('POST', `/groups/${group.body.id}/branches`, {
    branchId: branch.body.id,
    isPrimary: true,
  });

  const athletes = [];
  for (const [firstName, lastName] of [
    ['Али', `Журналов ${stamp}`],
    ['Айгуль', `Журналова ${stamp}`],
    ['Серик', `Журналович ${stamp}`],
  ]) {
    const athlete = await call('POST', '/athletes', { firstName, lastName });
    athletes.push(athlete.body);
    await call('POST', `/groups/${group.body.id}/members`, { athleteId: athlete.body.id });
  }

  const template = await call('POST', '/schedule-templates', {
    groupId: group.body.id,
    year: now.getFullYear(),
    quarter: Math.floor(now.getMonth() / 3) + 1,
  });
  await call('POST', `/schedule-templates/${template.body.id}/slots`, {
    weekday: 'WEDNESDAY',
    startTime: '18:00',
    endTime: '19:30',
    hallId: hall.body.id,
    trainerId: trainer.body.id,
  });
  await call('POST', `/schedule-templates/${template.body.id}/publish`);
  await call('POST', `/schedule-templates/${template.body.id}/generate`);

  const sessions = await call('GET', `/training-sessions?groupId=${group.body.id}`);
  const first = sessions.body?.[0];
  const second = sessions.body?.[1];

  // Первое занятие: две отметки и одно предупреждение — так экран показывает
  // все состояния сразу.
  if (first) {
    await call('PUT', `/training-sessions/${first.id}/attendance`, {
      marks: [
        { athleteId: athletes[0].id, status: 'PRESENT', comment: 'Активно работал' },
        { athleteId: athletes[1].id, status: 'ABSENT' },
      ],
    });
  }
  if (second) {
    await call('POST', `/training-sessions/${second.id}/attendance/planned-absence`, {
      athleteId: athletes[2].id,
      reason: 'Поездка с семьей',
    });
  }

  console.log(
    JSON.stringify(
      {
        groupId: group.body.id,
        templateId: template.body.id,
        sessionId: first?.id,
        sessionWithAbsence: second?.id,
        athletes: athletes.map((athlete) => athlete.id),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.log('ERR', error.message);
  process.exitCode = 1;
});
