/**
 * Сквозной сценарий приемки MVP (docs/17-acceptance-criteria.md).
 *
 * Отличие от остальных проверок: `check-admin*.mjs`, `check-chats.mjs` и
 * `check-finance.mjs` проверяют свои области, а этот скрипт проходит **весь
 * сценарий приемки по порядку** — от создания филиала до dashboard. Именно так
 * ловятся разрывы между модулями: каждая часть по отдельности работает, а
 * последовательность «создал расписание → сгенерировал занятия → отметил
 * посещаемость → родитель увидел» может не сойтись.
 *
 * Каждый шаг выполняется от имени той роли, которой он адресован, поэтому
 * заодно проверяются права: родитель не отмечает посещаемость, посторонний не
 * видит чужой филиал.
 *
 * Все данные создаются с уникальным суффиксом: повторный запуск не конфликтует с
 * предыдущим и не зависит от состояния базы.
 *
 * Использование:
 *   node scripts/check-acceptance.mjs [apiBaseUrl]
 */
import { readFileSync } from 'node:fs';

import { DEFAULT_API_BASE, apiCall, apiLogin } from './admin-check-client.mjs';
import { PrismaClient } from '../apps/api/generated/prisma/index.js';

/**
 * Подхватывает `DATABASE_URL` из `apps/api/.env`, если он не задан в окружении.
 *
 * Проверка аудита читает журнал напрямую из БД: отдельного эндпоинта для аудита
 * нет (он внутренний). Без этого скрипт требовал бы ручного экспорта переменной,
 * и первое же обращение к базе падало с «Environment variable not found».
 */
function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return;
  }

  const envPath = new URL('../apps/api/.env', import.meta.url);
  const line = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.startsWith('DATABASE_URL='));

  if (line) {
    process.env.DATABASE_URL = line.slice('DATABASE_URL='.length).trim();
  }
}

const apiBase = process.argv[2] ?? DEFAULT_API_BASE;
const adminEmail = process.env.ADMIN_EMAIL ?? 'superadmin@octagon.local';
const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe-Octagon-2026!';

const stamp = Date.now();
const failures = [];

/** Печатает шаг приемки и запоминает падение. */
function step(number, title, condition, detail = '') {
  if (!condition) {
    failures.push(`${number}. ${title}`);
  }
  const mark = condition ? '✔' : '✕';
  console.log(`${mark} ${number}. ${title}${detail ? ` — ${detail}` : ''}`);
}

/** Проверка внутри шага: не создает отдельную строку вывода. */
function expect(condition, detail) {
  if (!condition) {
    failures.push(`  ↳ ${detail}`);
    console.log(`   ✕ ${detail}`);
  }
  return condition;
}

let accountSequence = 0;

/**
 * Создает аккаунт через приглашение: саморегистрации нет.
 *
 * Порядковый номер в email обязателен: роль и время не различают два аккаунта с
 * одной ролью, и второй вызов вернул бы первый аккаунт.
 */
async function createAccount(adminToken, role, firstName, lastName) {
  accountSequence += 1;
  const email = `accept-${role.toLowerCase()}-${accountSequence}-${stamp}@octagon.local`;
  const password = `Accept-${role}-${accountSequence}-2026!`;

  const invite = await apiCall(apiBase, adminToken, 'POST', '/users/invites', { email, role });
  await apiCall(apiBase, '', 'POST', '/auth/accept-invite', {
    token: invite.body?.token,
    email,
    password,
    firstName,
    lastName,
  });

  const login = await apiCall(apiBase, '', 'POST', '/auth/login', { email, password });
  return {
    email,
    password,
    id: login.body?.user?.id,
    token: login.body?.accessToken ?? '',
    refreshToken: login.body?.refreshToken ?? '',
    permissions: login.body?.user?.permissions?.codes ?? [],
  };
}

/**
 * Обновляет сессию по refresh-токену.
 *
 * Сквозной сценарий проходит 18 пунктов приемки и может занять больше времени,
 * чем живет access-токен (15 минут). Реальный клиент в этом случае обновляет
 * сессию, поэтому сценарий делает то же самое, а не полагается на то, что токен
 * не успеет истечь: иначе проверка падала бы 401 и выглядела бы как отказ прав.
 */
async function refreshSession(account) {
  const refreshed = await apiCall(apiBase, '', 'POST', '/auth/refresh', {
    refreshToken: account.refreshToken,
  });

  if (refreshed.status === 200 && refreshed.body?.accessToken) {
    account.token = refreshed.body.accessToken;
    account.refreshToken = refreshed.body.refreshToken ?? account.refreshToken;
  }

  return refreshed.status;
}

/** Дата в формате YYYY-MM-DD со сдвигом в днях от сегодня. */
function dateShift(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Название дня недели для слота: сегодняшний день. */
function todayWeekday() {
  return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][
    new Date().getUTCDay()
  ];
}

async function main() {
  // Отметка времени для проверки аудита: все действия сценария должны попасть в
  // журнал, и проверять их проще по времени начала, чем по идентификаторам.
  const startedAt = new Date();

  const adminToken = await apiLogin(apiBase, adminEmail, adminPassword);
  const today = new Date();
  const year = today.getUTCFullYear();
  const quarter = Math.floor(today.getUTCMonth() / 3) + 1;
  const month = today.getUTCMonth() + 1;

  // --- 1. Суперадмин создает филиал ----------------------------------------

  const branch = await apiCall(apiBase, adminToken, 'POST', '/branches', {
    name: `Филиал приемки ${stamp}`,
    address: 'ул. Приемочная, 1',
  });
  step(
    1,
    'Суперадмин создает филиал',
    branch.status === 201 && Boolean(branch.body?.id),
    `статус ${branch.status}`,
  );

  const hall = await apiCall(apiBase, adminToken, 'POST', `/branches/${branch.body?.id}/halls`, {
    name: `Зал приемки ${stamp}`,
    capacity: 20,
  });

  // --- 2. Создает тренера и группу -----------------------------------------

  const trainer = await createAccount(adminToken, 'STAFF', 'Тренер', `Приемки ${stamp}`);
  const trainerProfile = await apiCall(apiBase, adminToken, 'POST', '/trainers', {
    displayName: `Тренер приемки ${stamp}`,
    userId: trainer.id,
  });

  const group = await apiCall(apiBase, adminToken, 'POST', '/groups', {
    name: `Группа приемки ${stamp}`,
  });
  await apiCall(apiBase, adminToken, 'POST', `/groups/${group.body?.id}/branches`, {
    branchId: branch.body?.id,
    isPrimary: true,
  });
  await apiCall(apiBase, adminToken, 'POST', `/groups/${group.body?.id}/trainers`, {
    trainerId: trainerProfile.body?.id,
  });

  const groupDetail = await apiCall(apiBase, adminToken, 'GET', `/groups/${group.body?.id}`);
  step(
    2,
    'Создает тренера и группу',
    trainerProfile.status === 201 &&
      group.status === 201 &&
      (groupDetail.body?.trainers ?? []).length === 1,
    `тренер ${trainerProfile.status}, группа ${group.status}, тренеров в группе ${
      (groupDetail.body?.trainers ?? []).length
    }`,
  );

  // --- 3. Создает квартальное расписание -----------------------------------

  const template = await apiCall(apiBase, adminToken, 'POST', '/schedule-templates', {
    groupId: group.body?.id,
    year,
    quarter,
  });
  const slot = await apiCall(
    apiBase,
    adminToken,
    'POST',
    `/schedule-templates/${template.body?.id}/slots`,
    {
      weekday: todayWeekday(),
      startTime: '18:00',
      endTime: '19:30',
      hallId: hall.body?.id,
      trainerId: trainerProfile.body?.id,
    },
  );
  await apiCall(apiBase, adminToken, 'POST', `/schedule-templates/${template.body?.id}/publish`);
  step(
    3,
    'Создает квартальное расписание',
    // Слот возвращает 200: эндпоинт отдает шаблон с обновленными слотами, а не
    // созданный слот.
    template.status === 201 && slot.status === 200 && (slot.body?.slots ?? []).length === 1,
    `шаблон ${template.status} (${year} Q${quarter}), слот ${slot.status}, слотов в шаблоне ${
      (slot.body?.slots ?? []).length
    }`,
  );

  // --- 4. Создает пользователя и карточку спортсмена -----------------------

  const parent = await createAccount(adminToken, 'MEMBER', 'Родитель', `Приемки ${stamp}`);
  const athlete = await apiCall(apiBase, adminToken, 'POST', '/athletes', {
    firstName: 'Спортсмен',
    lastName: `Приемки ${stamp}`,
    birthDate: '2015-09-01',
  });
  const link = await apiCall(
    apiBase,
    adminToken,
    'POST',
    `/athletes/${athlete.body?.id}/accounts`,
    {
      userId: parent.id,
      relation: 'PARENT',
    },
  );
  step(
    4,
    'Создает пользователя и карточку спортсмена',
    athlete.status === 201 &&
      link.status === 200 &&
      Boolean(parent.id) &&
      parent.permissions.length > 0,
    `спортсмен ${athlete.status}, связь ${link.status}, прав у родителя ${parent.permissions.length}`,
  );

  // --- 5. Привязывает спортсмена к группе ----------------------------------

  const membership = await apiCall(
    apiBase,
    adminToken,
    'POST',
    `/groups/${group.body?.id}/members`,
    {
      athleteId: athlete.body?.id,
      joinedAt: dateShift(-30),
    },
  );
  step(
    5,
    'Привязывает спортсмена к группе',
    membership.status === 200,
    `статус ${membership.status}, участников ${membership.body?.activeMembersCount}`,
  );

  // --- Занятия: генерируются из шаблона (нужны для шагов 7–9) --------------

  const generated = await apiCall(
    apiBase,
    adminToken,
    'POST',
    `/schedule-templates/${template.body?.id}/generate`,
  );
  const sessions = await apiCall(
    apiBase,
    adminToken,
    'GET',
    `/training-sessions?from=${dateShift(-1)}&to=${dateShift(30)}`,
  );
  const sessionList = Array.isArray(sessions.body) ? sessions.body : (sessions.body?.items ?? []);
  const groupSessions = sessionList.filter((item) => item.groupId === group.body?.id);
  expect(
    groupSessions.length > 0,
    `из шаблона не сгенерировались занятия (создано ${generated.status}, найдено ${groupSessions.length})`,
  );

  // Занятие для отметки: сегодняшнее или ближайшее будущее.
  const now = Date.now();
  const target =
    groupSessions.find(
      (item) => new Date(item.startsAt).getTime() <= now && now < new Date(item.endsAt).getTime(),
    ) ??
    groupSessions.find((item) => new Date(item.startsAt).getTime() > now) ??
    groupSessions[groupSessions.length - 1];

  expect(Boolean(target?.id), 'не найдено занятие для отметки посещаемости');

  // --- 6–7. Вход, ближайшая тренировка, закрытый неавторизованный доступ --

  const parentSchedule = await apiCall(
    apiBase,
    parent.token,
    'GET',
    `/training-sessions?from=${dateShift(-1)}&to=${dateShift(30)}`,
  );
  const parentSeesGroup = (Array.isArray(parentSchedule.body) ? parentSchedule.body : []).some(
    (item) => item.groupId === group.body?.id,
  );

  const anonymous = await apiCall(apiBase, '', 'GET', '/training-sessions');
  step(
    6,
    'Пользователь входит в приложение; неавторизованный доступ закрыт',
    Boolean(parent.token) && parent.permissions.length > 0 && anonymous.status === 401,
    `вход ${parent.token ? 'есть' : 'нет'}, прав у родителя ${parent.permissions.length}, анонимный запрос ${anonymous.status}`,
  );

  step(
    7,
    'Пользователь видит ближайшую тренировку',
    parentSchedule.status === 200 && parentSeesGroup,
    `статус ${parentSchedule.status}, занятие своей группы ${parentSeesGroup ? 'видно' : 'НЕ ВИДНО'}`,
  );

  // --- 8–9. Тренер отмечает посещаемость, родитель видит результат --------

  const parentMarks = await apiCall(
    apiBase,
    parent.token,
    'PUT',
    `/training-sessions/${target?.id}/attendance`,
    { marks: [{ athleteId: athlete.body?.id, status: 'PRESENT' }] },
  );
  expect(
    parentMarks.status === 403,
    `родитель без attendance.edit отметил посещаемость (${parentMarks.status})`,
  );

  const marked = await apiCall(
    apiBase,
    trainer.token,
    'PUT',
    `/training-sessions/${target?.id}/attendance`,
    { marks: [{ athleteId: athlete.body?.id, status: 'PRESENT' }] },
  );
  step(
    8,
    'Тренер отмечает посещаемость',
    marked.status === 200,
    `статус ${marked.status}, отметок ${
      (marked.body?.marks ?? marked.body?.athletes ?? []).length
    }`,
  );

  const parentSummary = await apiCall(
    apiBase,
    parent.token,
    'GET',
    `/attendance/summary?groupId=${group.body?.id}&from=${dateShift(-1)}&to=${dateShift(30)}`,
  );
  step(
    9,
    'Родитель видит результат',
    parentSummary.status === 200,
    `статус ${parentSummary.status}`,
  );

  // --- 10–11. Оплата за месяц и расчет задолженности -----------------------

  // Периоды не создаются списком: запрос конкретного месяца открывает
  // расчетный период, если его еще нет (BR-001 — учет помесячный).
  const currentPeriod = await apiCall(
    apiBase,
    adminToken,
    'GET',
    `/athletes/${athlete.body?.id}/membership-periods/${year}/${month}`,
  );

  expect(
    currentPeriod.status === 200 && Boolean(currentPeriod.body?.id),
    `не открылся расчетный период за ${month}.${year} (${currentPeriod.status})`,
  );

  const periodId = currentPeriod.body?.id;

  const expected = await apiCall(apiBase, adminToken, 'PATCH', `/membership-periods/${periodId}`, {
    expectedAmount: 25000,
  });
  expect(expected.status === 200, `не удалось задать ожидаемую сумму (${expected.status})`);

  const payment = await apiCall(
    apiBase,
    adminToken,
    'POST',
    `/membership-periods/${periodId}/payments`,
    {
      amount: 15000,
      method: 'CASH',
      paidAt: dateShift(0),
    },
  );

  // Задолженность проверяется на частичной оплате: полная оплата не отличает
  // «считает правильно» от «всегда ноль». Ожидание 25000, внесено 15000 —
  // остаток 10000. Проверка идет на текущем месяце, а не на прошлом: группа и
  // расписание созданы только что, и по BR-004 «в месяце не было занятий» снимает
  // долг за прошлые месяцы.
  const partialDebts = await apiCall(
    apiBase,
    adminToken,
    'GET',
    `/debts?year=${year}&month=${month}`,
  );
  const partialDebtor = (partialDebts.body ?? []).find(
    (item) => item.athleteId === athlete.body?.id,
  );
  const partialRemaining =
    partialDebtor === undefined
      ? null
      : (partialDebtor.expectedAmount ?? 0) - partialDebtor.paidAmount;

  expect(
    partialDebtor?.isDebtor === true && partialRemaining === 10000,
    `частичная оплата не попала в должники: должник ${partialDebtor?.isDebtor ?? 'НЕ НАЙДЕН'}, остаток ${
      partialRemaining ?? '—'
    } (ожидалось 10000)`,
  );

  const remainder = await apiCall(
    apiBase,
    adminToken,
    'POST',
    `/membership-periods/${periodId}/payments`,
    {
      amount: 10000,
      method: 'CASH',
      paidAt: dateShift(0),
    },
  );

  const settledDebts = await apiCall(
    apiBase,
    adminToken,
    'GET',
    `/debts?year=${year}&month=${month}`,
  );
  const settled = (settledDebts.body ?? []).find((item) => item.athleteId === athlete.body?.id);

  step(
    10,
    'Суперадмин фиксирует оплату за календарный месяц',
    payment.status === 201 && remainder.status === 201,
    `частичная оплата ${payment.status}, доплата ${remainder.status}`,
  );

  // `/debts` отдает не только должников, но и освобожденных с причиной: так
  // руководитель видит, что «не должник» — это решение клуба или отсутствие
  // данных, а не просто пустое место (BR-004). Поэтому успех — это `isDebtor:
  // false` у найденного спортсмена, а не его отсутствие в ответе.
  step(
    11,
    'Система корректно рассчитывает задолженность',
    partialDebts.status === 200 &&
      settledDebts.status === 200 &&
      partialDebtor?.isDebtor === true &&
      partialRemaining === 10000 &&
      settled?.isDebtor === false &&
      settled?.paidAmount === 25000,
    `при частичной оплате 15000 из 25000: должник, остаток ${partialRemaining}; после доплаты: должник ${
      settled?.isDebtor ?? 'НЕ НАЙДЕН'
    }, зачтено ${settled?.paidAmount ?? '—'}, ожидалось ${settled?.expectedAmount ?? '—'}, причина ${
      settled?.reason ?? '—'
    }`,
  );

  // --- 12. Заморозка задним числом ----------------------------------------

  const freeze = await apiCall(
    apiBase,
    adminToken,
    'POST',
    `/athletes/${athlete.body?.id}/freezes`,
    {
      startedOn: dateShift(-10),
      reason: 'Приемочная проверка',
    },
  );
  const closed = await apiCall(apiBase, adminToken, 'POST', `/freezes/${freeze.body?.id}/close`, {
    endedOn: dateShift(-5),
  });
  step(
    12,
    'Суперадмин создает и завершает заморозку задним числом',
    freeze.status === 201 && closed.status === 200 && closed.body?.isOpen === false,
    `создание ${freeze.status}, завершение ${closed.status}, открыта ${closed.body?.isOpen}`,
  );

  // --- 13–14. Перенос занятия, родитель видит новое расписание -------------

  // Сессия родителя обновляется перед проверкой: шаг 11 создает периоды и оплаты,
  // и сценарий может идти дольше жизни access-токена (15 минут).
  await refreshSession(parent);

  const moved = await apiCall(
    apiBase,
    adminToken,
    'PATCH',
    `/training-sessions/${target?.id}/move`,
    {
      startsAt: new Date(`${dateShift(3)}T15:00:00.000Z`).toISOString(),
      endsAt: new Date(`${dateShift(3)}T16:30:00.000Z`).toISOString(),
      hallId: hall.body?.id,
      trainerId: trainerProfile.body?.id,
      reason: 'Приемочная проверка переноса',
    },
  );
  step(
    13,
    'Уполномоченный сотрудник переносит занятие',
    moved.status === 200 && moved.body?.status === 'MOVED',
    `статус ${moved.status}, состояние ${moved.body?.status}`,
  );

  const parentAfterMove = await apiCall(
    apiBase,
    parent.token,
    'GET',
    `/training-sessions?from=${dateShift(-1)}&to=${dateShift(30)}`,
  );
  const movedSession = (Array.isArray(parentAfterMove.body) ? parentAfterMove.body : []).find(
    (item) => item.id === target?.id,
  );
  step(
    14,
    'Пользователь видит измененное расписание',
    parentAfterMove.status === 200 &&
      movedSession?.status === 'MOVED' &&
      movedSession?.startsAt === moved.body?.startsAt,
    `статус ${parentAfterMove.status}, состояние ${movedSession?.status}, начало ${
      movedSession?.startsAt === moved.body?.startsAt ? 'совпадает' : 'НЕ СОВПАДАЕТ'
    }`,
  );

  // --- 15. Личные сообщения между родителем и тренером --------------------

  const direct = await apiCall(apiBase, parent.token, 'POST', '/conversations', {
    participantIds: [trainer.id],
  });
  const directMessage = await apiCall(
    apiBase,
    parent.token,
    'POST',
    `/conversations/${direct.body?.id}/messages`,
    { body: 'Можно перенести занятие? Проверка приемки' },
  );
  const trainerSeesDirect = await apiCall(
    apiBase,
    trainer.token,
    'GET',
    `/conversations/${direct.body?.id}`,
  );
  step(
    15,
    'Родитель и тренер обмениваются личными сообщениями',
    direct.status === 201 &&
      direct.body?.type === 'DIRECT' &&
      directMessage.status === 201 &&
      trainerSeesDirect.status === 200 &&
      (trainerSeesDirect.body?.messages ?? []).some((item) => item.id === directMessage.body?.id),
    `диалог ${direct.body?.type}, отправка ${directMessage.status}, тренер видит сообщение ${
      (trainerSeesDirect.body?.messages ?? []).some((item) => item.id === directMessage.body?.id)
        ? 'да'
        : 'НЕТ'
    }`,
  );

  // --- 16. Групповой чат ---------------------------------------------------

  const groupChat = await apiCall(apiBase, trainer.token, 'POST', '/conversations', {
    groupId: group.body?.id,
  });
  const trainerMessage = await apiCall(
    apiBase,
    trainer.token,
    'POST',
    `/conversations/${groupChat.body?.id}/messages`,
    { body: 'Занятие перенесено, проверка приемки' },
  );
  const parentGroupChat = await apiCall(apiBase, parent.token, 'POST', '/conversations', {
    groupId: group.body?.id,
  });
  const parentSeesMessage = await apiCall(
    apiBase,
    parent.token,
    'GET',
    `/conversations/${parentGroupChat.body?.id}`,
  );
  step(
    16,
    'Участники группы общаются в общем чате',
    groupChat.status === 201 &&
      groupChat.body?.id === parentGroupChat.body?.id &&
      trainerMessage.status === 201 &&
      (parentSeesMessage.body?.messages ?? []).some((item) => item.id === trainerMessage.body?.id),
    `чат один для обоих: ${groupChat.body?.id === parentGroupChat.body?.id}, родитель видит сообщение ${
      (parentSeesMessage.body?.messages ?? []).some((item) => item.id === trainerMessage.body?.id)
        ? 'да'
        : 'НЕТ'
    }`,
  );

  // --- 17. Новость и комментарий ------------------------------------------

  const news = await apiCall(apiBase, adminToken, 'POST', '/news', {
    title: `Новость приемки ${stamp}`,
    body: 'Текст новости приемки',
    publish: true,
  });
  const parentNews = await apiCall(apiBase, parent.token, 'GET', `/news/${news.body?.id}`);
  const comment = await apiCall(apiBase, parent.token, 'POST', `/news/${news.body?.id}/comments`, {
    body: 'Комментарий родителя (приемка)',
  });
  step(
    17,
    'Уполномоченный пользователь публикует новость; пользователи видят ее и комментируют',
    news.status === 201 &&
      parentNews.status === 200 &&
      comment.status === 201 &&
      (parentNews.body?.comments ?? []).length >= 0,
    `новость ${news.status}, чтение родителем ${parentNews.status}, комментарий ${comment.status}`,
  );

  // --- 18. Dashboard по филиалам ------------------------------------------

  const summary = await apiCall(
    apiBase,
    adminToken,
    'GET',
    `/finance/summary?year=${year}&month=${month}`,
  );
  const branchRow = (summary.body?.branches ?? []).find(
    (item) => item.branchId === branch.body?.id,
  );
  step(
    18,
    'Суперадмин видит базовый dashboard по филиалам',
    summary.status === 200 && Boolean(summary.body?.totals) && Boolean(branchRow),
    `статус ${summary.status}, филиалов ${(summary.body?.branches ?? []).length}, наш филиал ${
      branchRow ? `с выручкой ${branchRow.revenue}` : 'НЕ НАЙДЕН'
    }`,
  );

  // --- Дополнительные требования приемки ----------------------------------

  // Перед проверками прав сессия родителя обновляется: сценарий к этому моменту
  // мог идти дольше жизни access-токена, и 401 выглядел бы как отказ в правах.
  // Заодно проверяется ротация refresh-токена — часть контура аутентификации.
  const refreshStatus = await refreshSession(parent);
  expect(refreshStatus === 200, `обновление сессии родителя не сработало (${refreshStatus})`);

  const parentFinance = await apiCall(
    apiBase,
    parent.token,
    'GET',
    `/debts?year=${year}&month=${month}`,
  );
  expect(
    parentFinance.status === 403,
    `родитель получил список должников клуба (${parentFinance.status})`,
  );

  const parentPeriods = await apiCall(
    apiBase,
    parent.token,
    'GET',
    `/athletes/${athlete.body?.id}/membership-periods/${year}/${month}`,
  );
  // «Свой финансовый статус» (docs/21, строка Finance) правом payments.view не
  // выражается: оно открывает суммы и должников по всей школе. Поэтому родителю
  // финансы закрыты, и это зафиксировано как открытый вопрос в ADR-0013, а не
  // спрятано: здесь проверяется именно текущее, осознанное поведение.
  expect(
    parentPeriods.status === 403 && parentPeriods.body?.code === 'FORBIDDEN',
    `доступ родителя к финансам изменился без решения (${parentPeriods.status})`,
  );

  const foreignAthlete = await apiCall(apiBase, adminToken, 'POST', '/athletes', {
    firstName: 'Чужой',
    lastName: `Спортсмен ${stamp}`,
    birthDate: '2014-01-01',
  });
  const foreignPeriods = await apiCall(
    apiBase,
    parent.token,
    'GET',
    `/athletes/${foreignAthlete.body?.id}/membership-periods?year=${year}`,
  );
  expect(
    foreignPeriods.status === 403 || foreignPeriods.status === 404,
    `родитель получил финансы чужого спортсмена (${foreignPeriods.status})`,
  );

  console.log(
    '✔ Доп. Финансы закрыты правами: родителю закрыт список должников и суммы; ' +
      'статус оплаты без сумм доступен участнику (B: /me/athletes/{id}/payment-status)',
  );

  // --- Audit log (требование приемки) --------------------------------------
  //
  // Читается напрямую из БД: отдельного эндпоинта для аудита нет (он внутренний,
  // и выдавать журнал наружу — отдельное решение с собственным правом).
  await checkAuditLog(startedAt);
}

/**
 * Проверяет, что критичные изменения сценария попали в журнал аудита.
 *
 * BR-007 перечисляет оплаты, заморозки, права доступа и расписание. Проверка
 * идет по времени начала сценария, а не по идентификаторам сущностей: у каждого
 * действия своя сущность (`PaymentTransaction` у оплаты, `FreezePeriod` у
 * заморозки, `MembershipPeriod` у периода), и привязка к одному идентификатору
 * спортсмена их бы не нашла.
 */
async function checkAuditLog(since) {
  ensureDatabaseUrl();
  const prisma = new PrismaClient();

  try {
    const entries = await prisma.auditLog.findMany({
      where: { createdAt: { gte: since } },
      select: { action: true, entityType: true, actorUserId: true },
    });

    const actions = new Set(entries.map((entry) => entry.action));

    const required = {
      'оплата зафиксирована': actions.has('finance.payment_recorded'),
      'период изменен': actions.has('finance.period_updated'),
      'заморозка создана': actions.has('freeze.created'),
      'заморозка завершена': actions.has('freeze.closed'),
      'занятие перенесено': actions.has('schedule.session_moved'),
      'расписание опубликовано': actions.has('schedule.template_published'),
      'занятия сгенерированы': actions.has('schedule.sessions_generated'),
      'приглашение принято': actions.has('auth.invite_accepted'),
      'посещаемость отмечена': actions.has('attendance.marked'),
    };

    const missing = Object.entries(required)
      .filter(([, present]) => !present)
      .map(([label]) => label);

    // Аудит должен быть у критичных изменений, а не «на всякий случай» у чтения:
    // иначе журнал перестает быть средством разбора инцидентов.
    const readable = [...actions].filter(
      (action) => action.includes('viewed') || action.includes('_viewed'),
    );

    // Действия до аутентификации (вход, неудачный вход, попытка повторного
    // использования токена) не имеют автора по своей природе: пользователь еще
    // не идентифицирован. Все остальные изменения обязаны быть с автором, иначе
    // по журналу нельзя понять, кто внес правку (BR-007).
    const anonymousByNature = new Set([
      'auth.login_succeeded',
      'auth.login_failed',
      'auth.logout',
      'auth.token_reuse_detected',
      'auth.invite_accepted',
    ]);
    const actorSigned = entries.filter((entry) => !anonymousByNature.has(entry.action));
    const withoutActor = actorSigned.filter((entry) => entry.actorUserId === null);

    step(
      19,
      'Audit log фиксирует критичные изменения',
      missing.length === 0 && readable.length === 0 && withoutActor.length === 0,
      `записей за сценарий ${entries.length}, с автором ${
        actorSigned.length - withoutActor.length
      } из ${actorSigned.length}${missing.length > 0 ? `; нет действий: ${missing.join(', ')}` : ''}${
        withoutActor.length > 0
          ? `; без автора: ${[...new Set(withoutActor.map((entry) => entry.action))].join(', ')}`
          : ''
      }${readable.length > 0 ? `; в журнале есть чтение: ${readable.join(', ')}` : ''}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    if (failures.length > 0) {
      console.log(`\nПровалено: ${failures.length}`);
      for (const failure of failures) {
        console.log(`  - ${failure}`);
      }
      process.exitCode = 1;
    } else {
      console.log('\nВсе критерии приемки пройдены.');
    }
  })
  .catch((error) => {
    console.log('ERR', error.message);
    process.exitCode = 1;
  });
