/**
 * Живая проверка финансов и заморозок на реальной БД.
 *
 * Проверяет то, что нельзя подтвердить моками:
 * - статус периода выводится из фактических оплат, а ручная отметка «оплачен
 *   полностью» его перекрывает (BR-003);
 * - сумма оплаты произвольная (BR-002);
 * - повторная отправка с ключом идемпотентности не создает вторую оплату;
 * - отмена оплаты пересчитывает период;
 * - **задолженность (BR-004) целиком**: занятие заносится задним числом через
 *   `POST /training-sessions`, и спортсмен становится должником;
 * - заморозка снимает задолженность (условие 4), отметка об оплате — тоже
 *   (условие 2), отсутствие занятий — тоже (условие 3);
 * - заморозка: один открытый период, даты можно вносить задним числом (BR-005).
 *
 * Расчетный месяц выбирается так, чтобы в нем уже были прошедшие дни: иначе
 * занятие задним числом занести некуда. Если сегодня первое или второе число,
 * проверка идет за предыдущий месяц.
 *
 * Использование: node scripts/check-finance.mjs [apiBaseUrl]
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

const calendar = (date) => date.toISOString().slice(0, 10);

async function main() {
  const login = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  token = login.body?.accessToken ?? '';
  check(Boolean(token), `вход: ${login.status}`);

  const now = new Date();

  // Расчетный месяц: нужен прошедший день, чтобы занести занятие задним числом.
  const usePreviousMonth = now.getUTCDate() < 3;
  const billing = usePreviousMonth
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const year = billing.getUTCFullYear();
  const month = billing.getUTCMonth() + 1;

  // Две даты внутри месяца: занятие и (раньше) вступление в группу.
  const sessionDate = new Date(Date.UTC(year, month - 1, usePreviousMonth ? 15 : 5));
  const joinDate = new Date(Date.UTC(year, month - 1, 1));

  // --- Подготовка: группа со спортсменом и прошедшим занятием ------------
  const group = await call('POST', '/groups', { name: `Группа финансов ${stamp}` });
  const athlete = await call('POST', '/athletes', {
    firstName: 'Плательщик',
    lastName: `Финансов ${stamp}`,
  });
  const athleteId = athlete.body.id;
  // Спортсмен вступил до занятия: иначе занятие не считается «тренировкой его
  // группы» на эту дату, и условие 3 BR-004 не выполняется.
  await call('POST', `/groups/${group.body.id}/members`, {
    athleteId,
    joinedAt: calendar(joinDate),
  });

  const session = await call('POST', '/training-sessions', {
    groupId: group.body.id,
    date: calendar(sessionDate),
    startTime: '18:00',
    endTime: '19:30',
    reason: `Проверка задолженности ${stamp}`,
  });
  check(
    session.status === 201 && session.body?.fromTemplate === false,
    `занятие занесено задним числом: ${session.status}, ${calendar(sessionDate)} 18:00`,
  );
  // 18:00 Алматы = 13:00 UTC: проверяется перевод локального времени.
  check(
    typeof session.body?.startsAt === 'string' && session.body.startsAt.endsWith('T13:00:00.000Z'),
    `локальное время переведено в UTC: ${session.body?.startsAt}`,
  );

  // --- Период и оплаты (BR-001, BR-002) ---------------------------------
  const period = await call('GET', `/athletes/${athleteId}/membership-periods/${year}/${month}`);
  check(period.status === 200, `период за ${year}-${month} получен: ${period.status}`);
  check(period.body?.status === 'UNPAID', `начальный статус: ${period.body?.status}`);
  const periodId = period.body?.id;

  const expected = await call('PATCH', `/membership-periods/${periodId}`, {
    expectedAmount: 25000,
    note: 'Проверка ожидаемой суммы',
  });
  check(expected.body?.expectedAmount === 25000, `ожидаемая сумма: ${expected.body?.expectedAmount}`);

  // --- Задолженность: все четыре условия выполнены ----------------------
  const debts = await call('GET', `/debts?year=${year}&month=${month}`);
  const debtor = (debts.body ?? []).find((item) => item.athleteId === athleteId);
  check(debts.status === 200, `список должников получен: ${debts.status}`);
  check(
    debtor?.isDebtor === true,
    `спортсмен должник: isDebtor=${debtor?.isDebtor}, причина=${debtor?.reason ?? 'нет'}`,
  );
  // Проверяется инвариант сортировки, а не позиция: в базе остаются данные
  // прошлых запусков, и «первый в списке» зависит от их имен.
  const allDebtors = (debts.body ?? []).filter((item) => item.isDebtor);
  const ourIndex = (debts.body ?? []).findIndex((item) => item.athleteId === athleteId);
  check(
    ourIndex >= 0 && ourIndex < allDebtors.length,
    `должники идут первыми: наш на позиции ${ourIndex + 1}, всего должников ${allDebtors.length}`,
  );

  // Сосед по группе: членство есть, занятий у него нет — условие 3 не выполнено.
  const idle = await call('POST', '/athletes', {
    firstName: 'Беззанятийный',
    lastName: `Финансов ${stamp}`,
  });
  await call('POST', `/groups/${group.body.id}/members`, {
    athleteId: idle.body.id,
    joinedAt: calendar(joinDate),
  });
  const idleDebts = await call('GET', `/debts?year=${year}&month=${month}`);
  const idleEntry = (idleDebts.body ?? []).find((item) => item.athleteId === idle.body.id);
  check(
    idleEntry?.isDebtor === true,
    `сосед по группе тоже должник (занятие у группы общее): ${idleEntry?.isDebtor}`,
  );

  // Повторное создание того же занятия — не ошибка сервера, а понятный отказ:
  // занятие группы уникально по времени начала.
  const duplicate = await call('POST', '/training-sessions', {
    groupId: group.body.id,
    date: calendar(sessionDate),
    startTime: '18:00',
    endTime: '19:30',
    reason: `Проверка дубля ${stamp}`,
  });
  check(
    duplicate.status === 409 && duplicate.body?.code === 'TRAINING_SESSION_DUPLICATE',
    `дубль занятия отклонен: ${duplicate.status} ${duplicate.body?.code}`,
  );

  // Спортсмен без занятий в группе: условие 3 не выполняется.
  const lonelyGroup = await call('POST', '/groups', { name: `Группа без занятий ${stamp}` });
  const lonely = await call('POST', '/athletes', {
    firstName: 'Беззанятий',
    lastName: `Финансов ${stamp}`,
  });
  await call('POST', `/groups/${lonelyGroup.body.id}/members`, {
    athleteId: lonely.body.id,
    joinedAt: calendar(joinDate),
  });
  const lonelyDebts = await call('GET', `/debts?year=${year}&month=${month}`);
  const lonelyEntry = (lonelyDebts.body ?? []).find((item) => item.athleteId === lonely.body.id);
  check(
    lonelyEntry?.isDebtor === false && lonelyEntry?.reason === 'NO_TRAININGS_YET',
    `без занятий задолженности нет: ${lonelyEntry?.reason}`,
  );

  // --- Произвольная сумма и статусы (BR-002) ----------------------------
  const partial = await call('POST', `/membership-periods/${periodId}/payments`, {
    amount: 10000,
    method: 'CASH',
    idempotencyKey: `check-finance-${stamp}`,
  });
  check(partial.status === 201, `оплата внесена: ${partial.status}`);
  check(partial.body?.paidAmount === 10000, `оплачено: ${partial.body?.paidAmount}`);
  check(
    partial.body?.status === 'PARTIALLY_PAID',
    `статус после частичной оплаты: ${partial.body?.status}`,
  );

  const repeated = await call('POST', `/membership-periods/${periodId}/payments`, {
    amount: 10000,
    method: 'CASH',
    idempotencyKey: `check-finance-${stamp}`,
  });
  check(
    repeated.body?.paidAmount === 10000 && repeated.body?.payments?.length === 1,
    `повтор с тем же ключом не создал вторую оплату: оплат ${repeated.body?.payments?.length}`,
  );

  const full = await call('POST', `/membership-periods/${periodId}/payments`, {
    amount: 15000,
    method: 'TRANSFER',
  });
  check(full.body?.status === 'PAID', `после полной оплаты статус: ${full.body?.status}`);

  // --- Отмена оплат возвращает задолженность ----------------------------
  for (const payment of full.body?.payments ?? []) {
    await call('DELETE', `/payments/${payment.id}`);
  }
  const afterVoid = await call('GET', `/athletes/${athleteId}/membership-periods/${year}/${month}`);
  check(
    afterVoid.body?.paidAmount === 0 && afterVoid.body?.status === 'UNPAID',
    `отмена оплат вернула период в: ${afterVoid.body?.status}, оплачено ${afterVoid.body?.paidAmount}`,
  );

  // --- Условие 2: ручная отметка «оплачен полностью» (BR-003) -----------
  const marked = await call('POST', `/membership-periods/${periodId}/fully-paid`, { marked: true });
  check(marked.body?.status === 'FULLY_PAID_MARKED', `отметка дала статус: ${marked.body?.status}`);

  const markedDebts = await call('GET', `/debts?year=${year}&month=${month}`);
  const markedEntry = (markedDebts.body ?? []).find((item) => item.athleteId === athleteId);
  check(
    markedEntry?.isDebtor === false && markedEntry?.reason === 'MARKED_FULLY_PAID',
    `отметка освободила от задолженности: ${markedEntry?.reason}`,
  );

  const unmarked = await call('POST', `/membership-periods/${periodId}/fully-paid`, {
    marked: false,
  });
  check(
    unmarked.body?.status !== 'FULLY_PAID_MARKED',
    `отметка снята, статус вернулся: ${unmarked.body?.status}`,
  );

  // После снятия отметки спортсмен снова должник: занятие состоялось.
  const backToDebtor = await call('GET', `/debts?year=${year}&month=${month}`);
  const backEntry = (backToDebtor.body ?? []).find((item) => item.athleteId === athleteId);
  check(backEntry?.isDebtor === true, `после снятия отметки снова должник: ${backEntry?.isDebtor}`);

  // --- Условие 4: заморозка (BR-005) ------------------------------------
  // Задолженность оценивается на начало месяца, поэтому заморозка должна
  // накрывать это начало.
  const freezeStart = new Date(Date.UTC(year, month - 1, 1));
  freezeStart.setUTCDate(freezeStart.getUTCDate() - 3);

  const freeze = await call('POST', `/athletes/${athleteId}/freezes`, {
    startedOn: calendar(freezeStart),
    reason: 'Проверка заморозки',
  });
  check(
    freeze.status === 201 && freeze.body?.isOpen === true,
    `заморозка открыта задним числом: ${freeze.body?.startedOn}`,
  );

  const frozenDebts = await call('GET', `/debts?year=${year}&month=${month}`);
  const frozenEntry = (frozenDebts.body ?? []).find((item) => item.athleteId === athleteId);
  check(
    frozenEntry?.isDebtor === false && frozenEntry?.reason === 'FROZEN',
    `заморозка освободила от задолженности: ${frozenEntry?.reason}`,
  );

  const secondFreeze = await call('POST', `/athletes/${athleteId}/freezes`, {
    startedOn: calendar(now),
  });
  check(
    secondFreeze.status === 409 && secondFreeze.body?.code === 'FREEZE_ALREADY_OPEN',
    `вторая заморозка отклонена: ${secondFreeze.status} ${secondFreeze.body?.code}`,
  );

  const closed = await call('POST', `/freezes/${freeze.body.id}/close`, {
    endedOn: calendar(freezeStart),
  });
  check(
    closed.status === 200 && closed.body?.isOpen === false,
    `заморозка закрыта задним числом: ${closed.body?.endedOn}`,
  );

  const closeAgain = await call('POST', `/freezes/${freeze.body.id}/close`, {
    endedOn: calendar(now),
  });
  check(closeAgain.status === 409, `повторное закрытие отклонено: ${closeAgain.status}`);

  const invalidRange = await call('POST', `/athletes/${athleteId}/freezes`, {
    startedOn: calendar(now),
    reason: 'Проверка порядка дат',
  });
  const invalidClose = await call('POST', `/freezes/${invalidRange.body?.id}/close`, {
    endedOn: calendar(new Date(now.getTime() - 5 * 86_400_000)),
  });
  check(
    invalidClose.status === 400 && invalidClose.body?.code === 'FREEZE_PERIOD_INVALID',
    `завершение раньше начала отклонено: ${invalidClose.status} ${invalidClose.body?.code}`,
  );

  // --- Очистка ----------------------------------------------------------
  await call('DELETE', `/groups/${group.body.id}`);
  await call('DELETE', `/groups/${lonelyGroup.body.id}`);
  console.log(
    `\nРасчетный месяц: ${year}-${String(month).padStart(2, '0')}, занятие: ${calendar(sessionDate)} (метка ${stamp})`,
  );
}

main().catch((error) => {
  console.log('ERR', error.message);
  process.exitCode = 1;
});
