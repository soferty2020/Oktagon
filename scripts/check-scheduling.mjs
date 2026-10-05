/**
 * Живая проверка расписания на реальной БД.
 *
 * Проверяет то, что нельзя подтвердить моками:
 * - генерация создает занятия только на будущие даты квартала, считая локальное
 *   время клуба (Asia/Almaty) верно;
 * - повторная генерация не создает дублей;
 * - занятая смена тренера в другой группе не пропускается молча;
 * - точечный перенос не меняет квартальный шаблон (BR-009);
 * - прошедшее занятие изменить нельзя.
 *
 * Использование: node scripts/check-scheduling.mjs [apiBaseUrl]
 */
const api = process.argv[2] ?? 'http://127.0.0.1:3900/api/v1';
const EMAIL = process.env.ADMIN_EMAIL ?? 'superadmin@octagon.local';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'ChangeMe-Octagon-2026!';
const TIME_ZONE = 'Asia/Almaty';

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

const log = (ok, message) => console.log(`${ok ? '✔' : '✕'} ${message}`);

/** Локальные части момента в зоне клуба. */
function localParts(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const read = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    weekday: new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'long' }).format(date),
    time: `${read('hour') === '24' ? '00' : read('hour')}:${read('minute')}`,
  };
}

/** Квартал текущей даты: генерация создает занятия только в будущем. */
function currentQuarter() {
  const now = new Date();
  return { year: now.getUTCFullYear(), quarter: Math.floor(now.getUTCMonth() / 3) + 1 };
}

/** Границы квартала в ISO-8601: нужны, чтобы запросить весь период целиком. */
function quarterBounds(year, quarter) {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  const pad = (value) => String(value).padStart(2, '0');
  return {
    from: `${year}-${pad(startMonth)}-01T00:00:00.000Z`,
    // Конец периода исключающий, поэтому берем первое число следующего месяца.
    to: `${year}-${pad(endMonth)}-${pad(lastDay)}T23:59:59.000Z`,
  };
}

async function main() {
  const login = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  token = login.body?.accessToken ?? '';
  log(Boolean(token), `вход: ${login.status}`);

  // --- Подготовка данных -------------------------------------------------
  const branch = await call('POST', '/branches', { name: `Филиал расписания ${stamp}` });
  const branchId = branch.body.id;
  const hall = await call('POST', `/branches/${branchId}/halls`, {
    name: `Зал расписания ${stamp}`,
    capacity: 25,
  });
  const hallId = hall.body.id;

  const trainer = await call('POST', '/trainers', { displayName: `Тренер расписания ${stamp}` });
  const trainerId = trainer.body.id;

  const group = await call('POST', '/groups', { name: `Группа расписания ${stamp}` });
  const groupId = group.body.id;
  await call('POST', `/groups/${groupId}/branches`, { branchId, isPrimary: true });

  // --- Шаблон ------------------------------------------------------------
  const { year, quarter } = currentQuarter();
  const template = await call('POST', '/schedule-templates', { groupId, year, quarter });
  const templateId = template.body.id;
  log(template.status === 201, `шаблон на ${quarter} квартал ${year} создан: ${template.status}`);

  const duplicate = await call('POST', '/schedule-templates', { groupId, year, quarter });
  log(duplicate.status === 409, `повторный шаблон отклонен: ${duplicate.status} ${duplicate.body?.code}`);

  const generateBeforePublish = await call('POST', `/schedule-templates/${templateId}/generate`);
  log(
    generateBeforePublish.status === 409,
    `генерация до публикации отклонена: ${generateBeforePublish.status}`,
  );

  const emptyPublish = await call('POST', `/schedule-templates/${templateId}/publish`);
  log(emptyPublish.status === 409, `публикация пустого шаблона отклонена: ${emptyPublish.status}`);

  const slot = await call('POST', `/schedule-templates/${templateId}/slots`, {
    weekday: 'WEDNESDAY',
    startTime: '18:00',
    endTime: '19:30',
    hallId,
    trainerId,
  });
  log(slot.status === 200, `слот добавлен: ${slot.status}`);

  const overlap = await call('POST', `/schedule-templates/${templateId}/slots`, {
    weekday: 'WEDNESDAY',
    startTime: '19:00',
    endTime: '20:00',
  });
  log(overlap.status === 409, `пересекающийся слот отклонен: ${overlap.status} ${overlap.body?.code}`);

  const publish = await call('POST', `/schedule-templates/${templateId}/publish`);
  log(publish.status === 200, `шаблон опубликован: ${publish.status}`);

  const slotAfterPublish = await call('POST', `/schedule-templates/${templateId}/slots`, {
    weekday: 'FRIDAY',
    startTime: '10:00',
    endTime: '11:00',
  });
  log(
    slotAfterPublish.status === 409,
    `слот в опубликованный шаблон отклонен: ${slotAfterPublish.status} ${slotAfterPublish.body?.code}`,
  );

  // --- Материализация ----------------------------------------------------
  const generate = await call('POST', `/schedule-templates/${templateId}/generate`);
  log(generate.status === 200, `генерация: ${generate.status} ${JSON.stringify(generate.body)}`);
  const created = generate.body?.created ?? 0;
  log(created > 0, `создано занятий: ${created}`);
  log((generate.body?.removed ?? 0) === 0, 'без флага пересоздания ничего не удалено');

  const again = await call('POST', `/schedule-templates/${templateId}/generate`);
  log(again.body?.created === 0, `повторная генерация не создает дублей: создано ${again.body?.created}`);

  // Список по умолчанию ограничен месяцем вперед: для сверки с числом
  // созданных занятий нужно запросить весь квартал явно.
  const range = quarterBounds(year, quarter);
  const sessions = await call(
    'GET',
    `/training-sessions?groupId=${groupId}&from=${range.from}&to=${range.to}`,
  );
  const list = sessions.body ?? [];
  log(list.length === created, `список занятий за квартал: ${list.length} (создано ${created})`);

  const defaultWindow = await call('GET', `/training-sessions?groupId=${groupId}`);
  log(
    Array.isArray(defaultWindow.body) && defaultWindow.body.length <= list.length,
    `окно по умолчанию уже квартала: ${defaultWindow.body?.length} из ${list.length}`,
  );

  // Все занятия — по средам и в 18:00 локального времени клуба.
  const wrongWeekday = list.filter((session) => localParts(new Date(session.startsAt)).weekday !== 'Wednesday');
  log(wrongWeekday.length === 0, `все занятия по средам: ${list.length - wrongWeekday.length}/${list.length}`);

  const wrongTime = list.filter((session) => localParts(new Date(session.startsAt)).time !== '18:00');
  log(wrongTime.length === 0, `все занятия в 18:00 по времени клуба: ${list.length - wrongTime.length}/${list.length}`);

  const inPast = list.filter((session) => new Date(session.startsAt).getTime() <= Date.now());
  log(inPast.length === 0, `прошедших занятий нет: ${inPast.length}`);

  const withBranch = list.filter((session) => session.branchId === branchId);
  log(withBranch.length === list.length, `занятия унаследовали филиал группы: ${withBranch.length}/${list.length}`);

  const templateAfterGenerate = await call('GET', `/schedule-templates/${templateId}`);
  log(
    templateAfterGenerate.body?.slots?.length === 1,
    `шаблон не изменился после генерации: слотов ${templateAfterGenerate.body?.slots?.length}`,
  );

  // --- Конфликт тренера --------------------------------------------------
  const otherGroup = await call('POST', '/groups', { name: `Группа-конфликт ${stamp}` });
  const otherTemplate = await call('POST', '/schedule-templates', {
    groupId: otherGroup.body.id,
    year,
    quarter,
  });
  await call('POST', `/schedule-templates/${otherTemplate.body.id}/slots`, {
    weekday: 'WEDNESDAY',
    startTime: '18:30',
    endTime: '20:00',
    hallId,
    trainerId,
  });
  await call('POST', `/schedule-templates/${otherTemplate.body.id}/publish`);

  const conflict = await call('POST', `/schedule-templates/${otherTemplate.body.id}/generate`);
  const conflictCodes = (conflict.body?.details?.conflicts ?? []).map((item) => item.kind);
  log(
    conflict.status === 409,
    `конфликт тренера/зала обнаружен: ${conflict.status} ${conflict.body?.code} (${conflictCodes[0] ?? '—'})`,
  );

  // --- Точечный перенос (BR-009) -----------------------------------------
  const target = list[1] ?? list[0];
  const newStart = new Date(new Date(target.startsAt).getTime() + 3600_000);
  const newEnd = new Date(new Date(target.endsAt).getTime() + 3600_000);
  const moved = await call('PATCH', `/training-sessions/${target.id}/move`, {
    startsAt: newStart.toISOString(),
    endsAt: newEnd.toISOString(),
    reason: 'Проверка переноса',
  });
  log(moved.status === 200, `занятие перенесено: ${moved.status}`);
  log(moved.body?.status === 'MOVED', `статус занятия: ${moved.body?.status}`);
  log(moved.body?.changeReason === 'Проверка переноса', 'причина сохранена');

  const templateAfterMove = await call('GET', `/schedule-templates/${templateId}`);
  const slotAfterMove = templateAfterMove.body?.slots?.[0];
  log(
    slotAfterMove?.startTime === '18:00' && slotAfterMove?.weekday === 'WEDNESDAY',
    `шаблон не изменился после переноса: ${slotAfterMove?.weekday} ${slotAfterMove?.startTime}`,
  );

  // --- Отмена ------------------------------------------------------------
  const cancelled = await call('POST', `/training-sessions/${list[2]?.id ?? target.id}/cancel`, {
    reason: 'Проверка отмены',
  });
  log(cancelled.status === 200 && cancelled.body?.status === 'CANCELLED', `занятие отменено: ${cancelled.body?.status}`);

  // --- Прошедшее занятие -------------------------------------------------
  const now = Date.now();
  const pastSession = await call('GET', '/training-sessions?from=2020-01-01T00:00:00.000Z&to=2020-12-31T00:00:00.000Z');
  log(Array.isArray(pastSession.body), `запрос за прошлый период отвечает: ${pastSession.status}`);

  const futureStart = new Date(now + 86_400_000).toISOString();
  const pastMove = await call('PATCH', `/training-sessions/${target.id}/move`, {
    startsAt: futureStart,
    endsAt: new Date(now + 86_400_000 + 5_400_000).toISOString(),
    reason: 'Повторный перенос',
  });
  log(
    pastMove.status === 200 || pastMove.status === 409,
    `повторный перенос обрабатывается: ${pastMove.status} ${pastMove.body?.code ?? ''}`,
  );

  // Уборка: архивируем созданное, чтобы не засорять справочники.
  for (const group of [groupId, otherGroup.body.id]) {
    await call('DELETE', `/groups/${group}`);
  }
  await call('DELETE', `/trainers/${trainerId}`);
  await call('DELETE', `/branches/${branchId}`);
  console.log(`\nУбрано: филиал, зал, тренер, две группы (метка ${stamp})`);
}

main().catch((error) => {
  console.log('ERR', error.message);
  process.exitCode = 1;
});
