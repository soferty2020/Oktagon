/**
 * Готовит данные расписания для живой проверки админки.
 *
 * Создает группу, филиал, зал, тренера, шаблон на текущий квартал со слотом и
 * материализует занятия. Идентификаторы печатает, чтобы проверить страницы.
 *
 * Использование: node scripts/seed-schedule-demo.mjs [apiBaseUrl]
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
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;

  const branch = await call('POST', '/branches', { name: `Филиал показа ${stamp}` });
  const hall = await call('POST', `/branches/${branch.body.id}/halls`, {
    name: `Зал показа ${stamp}`,
    capacity: 20,
  });
  const trainer = await call('POST', '/trainers', { displayName: `Тренер показа ${stamp}` });
  const group = await call('POST', '/groups', { name: `Группа показа ${stamp}` });
  await call('POST', `/groups/${group.body.id}/branches`, {
    branchId: branch.body.id,
    isPrimary: true,
  });

  const template = await call('POST', '/schedule-templates', {
    groupId: group.body.id,
    year,
    quarter,
  });
  await call('POST', `/schedule-templates/${template.body.id}/slots`, {
    weekday: 'WEDNESDAY',
    startTime: '18:00',
    endTime: '19:30',
    hallId: hall.body.id,
    trainerId: trainer.body.id,
  });
  await call('POST', `/schedule-templates/${template.body.id}/publish`);
  const generated = await call('POST', `/schedule-templates/${template.body.id}/generate`);
  const sessions = await call('GET', `/training-sessions?groupId=${group.body.id}`);

  const firstSession = sessions.body?.[0];
  const other = sessions.body?.[1];
  if (firstSession) {
    await call('PATCH', `/training-sessions/${firstSession.id}/move`, {
      startsAt: new Date(new Date(firstSession.startsAt).getTime() + 3_600_000).toISOString(),
      endsAt: new Date(new Date(firstSession.endsAt).getTime() + 3_600_000).toISOString(),
      reason: 'Школьное собрание',
    });
  }
  if (other) {
    await call('POST', `/training-sessions/${other.id}/cancel`, {
      reason: 'Низкая температура в зале',
    });
  }

  console.log(
    JSON.stringify(
      {
        groupId: group.body.id,
        templateId: template.body.id,
        generated: generated.body,
        sessions: sessions.body?.length ?? 0,
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
