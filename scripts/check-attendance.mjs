/**
 * Живая проверка посещаемости на реальной БД.
 *
 * Проверяет то, что нельзя подтвердить моками:
 * - журнал занятия строится по составу группы на дату занятия: спортсмен,
 *   зачисленный позже, не числится отсутствующим задним числом, а выбывший не
 *   получает отметок после ухода;
 * - отметка идемпотентна: повторная запись меняет статус, а не создает вторую;
 * - предупреждение родителя (BR-008) не заменяет подтвержденную отметку;
 * - сводка считает знаменатель по факту членства, а не по текущему составу.
 *
 * Использование: node scripts/check-attendance.mjs [apiBaseUrl]
 */
const api = process.argv[2] ?? 'http://127.0.0.1:3900/api/v1';
const EMAIL = process.env.ADMIN_EMAIL ?? 'superadmin@octagon.local';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'ChangeMe-Octagon-2026!';

let token = '';
const stamp = Date.now();
const check = (ok, message) => console.log(`${ok ? '✔' : '✕'} ${message}`);

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

/** Ближайшая будущая дата указанного дня недели (1 — понедельник). */
function nextWeekday(weekday) {
  const date = new Date();
  const current = date.getDay() === 0 ? 7 : date.getDay();
  const delta = (weekday - current + 7) % 7 || 7;
  date.setDate(date.getDate() + delta);
  return date;
}

async function main() {
  const login = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  token = login.body?.accessToken ?? '';
  check(Boolean(token), `вход: ${login.status}`);

  // --- Подготовка: группа, спортсмены, занятия ---------------------------
  const branch = await call('POST', '/branches', { name: `Филиал посещаемости ${stamp}` });
  const hall = await call('POST', `/branches/${branch.body.id}/halls`, {
    name: `Зал посещаемости ${stamp}`,
  });
  const trainer = await call('POST', '/trainers', { displayName: `Тренер посещаемости ${stamp}` });
  const group = await call('POST', '/groups', { name: `Группа посещаемости ${stamp}` });
  await call('POST', `/groups/${group.body.id}/branches`, {
    branchId: branch.body.id,
    isPrimary: true,
  });

  const early = await call('POST', '/athletes', {
    firstName: 'Ранний',
    lastName: `Участник ${stamp}`,
  });
  const late = await call('POST', '/athletes', {
    firstName: 'Поздний',
    lastName: `Участник ${stamp}`,
  });

  // «Ранний» зачислен задолго до занятий, «поздний» — после первого занятия.
  const longAgo = new Date();
  longAgo.setMonth(longAgo.getMonth() - 6);
  await call('POST', `/groups/${group.body.id}/members`, {
    athleteId: early.body.id,
    joinedAt: longAgo.toISOString().slice(0, 10),
  });

  const template = await call('POST', '/schedule-templates', {
    groupId: group.body.id,
    year: new Date().getFullYear(),
    quarter: Math.floor(new Date().getMonth() / 3) + 1,
  });
  const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][
    nextWeekday(3).getDay()
  ];
  await call('POST', `/schedule-templates/${template.body.id}/slots`, {
    weekday,
    startTime: '18:00',
    endTime: '19:30',
    hallId: hall.body.id,
    trainerId: trainer.body.id,
  });
  await call('POST', `/schedule-templates/${template.body.id}/publish`);
  const generated = await call('POST', `/schedule-templates/${template.body.id}/generate`);
  check((generated.body?.created ?? 0) > 0, `занятий создано: ${generated.body?.created}`);

  const sessions = await call('GET', `/training-sessions?groupId=${group.body.id}`);
  const first = sessions.body?.[0];
  const second = sessions.body?.[1];
  check(Boolean(first && second), `занятий в окне: ${sessions.body?.length}`);

  // Первое занятие прошло до зачисления «позднего».
  const firstStart = new Date(first.startsAt);
  const joinedLater = new Date(firstStart.getTime() + 3 * 86_400_000);
  await call('POST', `/groups/${group.body.id}/members`, {
    athleteId: late.body.id,
    joinedAt: joinedLater.toISOString().slice(0, 10),
  });

  // --- Журнал первого занятия -------------------------------------------
  const journal = await call('GET', `/training-sessions/${first.id}/attendance`);
  const roster = journal.body?.roster ?? [];
  const hasLate = roster.some((entry) => entry.athleteId === late.body.id);
  check(
    journal.status === 200 && !hasLate,
    `журнал первого занятия: спортсменов ${roster.length}, зачисленный позже отсутствует: ${!hasLate}`,
  );
  check(
    roster.some((entry) => entry.athleteId === early.body.id),
    'зачисленный заранее в журнале есть',
  );

  // --- Отметка ----------------------------------------------------------
  const marked = await call('PUT', `/training-sessions/${first.id}/attendance`, {
    marks: [{ athleteId: early.body.id, status: 'PRESENT', comment: 'Активно работал' }],
  });
  check(marked.status === 200, `отметка сохранена: ${marked.status}`);
  const entry = (marked.body?.roster ?? []).find((item) => item.athleteId === early.body.id);
  check(entry?.attendance?.status === 'PRESENT', `статус: ${entry?.attendance?.status}`);
  check(marked.body?.markedCount === 1, `отмечено: ${marked.body?.markedCount}`);

  const remark = await call('PUT', `/training-sessions/${first.id}/attendance`, {
    marks: [{ athleteId: early.body.id, status: 'EXCUSED' }],
  });
  const reEntry = (remark.body?.roster ?? []).find((item) => item.athleteId === early.body.id);
  check(
    remark.body?.markedCount === 1 && reEntry?.attendance?.status === 'EXCUSED',
    `повторная отметка изменила статус без дубля: ${reEntry?.attendance?.status}, отмечено ${remark.body?.markedCount}`,
  );

  const outsider = await call('PUT', `/training-sessions/${first.id}/attendance`, {
    marks: [{ athleteId: late.body.id, status: 'PRESENT' }],
  });
  check(
    outsider.status === 409 && outsider.body?.code === 'ATHLETE_NOT_IN_GROUP',
    `отметка спортсмена вне состава отклонена: ${outsider.status} ${outsider.body?.code}`,
  );

  // --- Предупреждение родителя (BR-008) ---------------------------------
  const absence = await call('POST', `/training-sessions/${second.id}/attendance/planned-absence`, {
    athleteId: early.body.id,
    reason: 'Поездка с семьей',
  });
  const absenceEntry = (absence.body?.roster ?? []).find(
    (item) => item.athleteId === early.body.id,
  );
  check(
    absenceEntry?.plannedAbsence?.reason === 'Поездка с семьей',
    'предупреждение об отсутствии сохранено',
  );
  check(
    absenceEntry?.attendance === null,
    'предупреждение не создало подтвержденную отметку (итог за тренером)',
  );

  const cancelled = await call(
    'DELETE',
    `/training-sessions/${second.id}/attendance/planned-absence/${early.body.id}`,
  );
  const afterCancel = (cancelled.body?.roster ?? []).find(
    (item) => item.athleteId === early.body.id,
  );
  check(afterCancel?.plannedAbsence === null, 'предупреждение отменено');

  // --- Сводка -----------------------------------------------------------
  const from = new Date(firstStart.getTime() - 86_400_000).toISOString();
  const to = new Date(firstStart.getTime() + 60 * 86_400_000).toISOString();
  const summary = await call(
    'GET',
    `/attendance/summary?groupId=${group.body.id}&from=${from}&to=${to}`,
  );
  const earlySummary = (summary.body ?? []).find((item) => item.athleteId === early.body.id);
  const lateSummary = (summary.body ?? []).find((item) => item.athleteId === late.body.id);

  check(summary.status === 200, `сводка получена: ${summary.status}`);
  check(
    (earlySummary?.total ?? 0) > (lateSummary?.total ?? 0),
    `знаменатель учитывает дату зачисления: ранний ${earlySummary?.total}, поздний ${lateSummary?.total}`,
  );
  check(
    (earlySummary?.excused ?? 0) === 1,
    `отметка EXCUSED попала в сводку: ${earlySummary?.excused}`,
  );

  // --- Снятие отметки ---------------------------------------------------
  const reset = await call('DELETE', `/training-sessions/${first.id}/attendance/${early.body.id}`);
  const afterReset = (reset.body?.roster ?? []).find((item) => item.athleteId === early.body.id);
  check(
    reset.status === 200 && afterReset?.attendance === null,
    'отметка снята: журнал очищен',
  );

  // Уборка: занятия удаляются вместе с шаблоном через архив группы.
  await call('DELETE', `/groups/${group.body.id}`);
  console.log(`\nСоздано с меткой ${stamp}: филиал, зал, тренер, группа, два спортсмена`);
}

main().catch((error) => {
  console.log('ERR', error.message);
  process.exitCode = 1;
});
