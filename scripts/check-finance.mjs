/**
 * Живая проверка финансов и заморозок на реальной БД.
 *
 * Проверяет то, что нельзя подтвердить моками:
 * - статус периода выводится из фактических оплат, а ручная отметка «оплачен
 *   полностью» его перекрывает (BR-003);
 * - сумма оплаты произвольная (BR-002);
 * - повторная отправка с ключом идемпотентности не создает вторую оплату;
 * - отмена оплаты пересчитывает период;
 * - задолженность (BR-004): условия 1, 2 и 4;
 * - заморозка: один открытый период, даты можно вносить задним числом (BR-005).
 *
 * Ограничение: условие 3 BR-004 («в месяце уже состоялась хотя бы одна
 * тренировка группы») проверить нечем, пока занятие в прошлом нельзя завести
 * через API: материализация создает только будущие занятия. Проверяется
 * противоположная ветка — отсутствие занятий исключает задолженность.
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

const addDays = (date, days) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const calendar = (date) => date.toISOString().slice(0, 10);

async function main() {
  const login = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  token = login.body?.accessToken ?? '';
  check(Boolean(token), `вход: ${login.status}`);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // --- Подготовка --------------------------------------------------------
  const group = await call('POST', '/groups', { name: `Группа финансов ${stamp}` });
  const athlete = await call('POST', '/athletes', {
    firstName: 'Плательщик',
    lastName: `Финансов ${stamp}`,
  });
  const athleteId = athlete.body.id;
  await call('POST', `/groups/${group.body.id}/members`, { athleteId });

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

  // Произвольная сумма: спортсмен пришел в середине месяца.
  const partial = await call(
    'POST',
    `/membership-periods/${periodId}/payments`,
    { amount: 10000, method: 'CASH', idempotencyKey: `check-finance-${stamp}` },
  );
  check(partial.status === 201, `оплата внесена: ${partial.status}`);
  check(partial.body?.paidAmount === 10000, `оплачено: ${partial.body?.paidAmount}`);
  check(
    partial.body?.status === 'PARTIALLY_PAID',
    `статус после частичной оплаты: ${partial.body?.status}`,
  );

  const repeated = await call(
    'POST',
    `/membership-periods/${periodId}/payments`,
    { amount: 10000, method: 'CASH', idempotencyKey: `check-finance-${stamp}` },
  );
  check(
    repeated.body?.paidAmount === 10000 && repeated.body?.payments?.length === 1,
    `повтор с тем же ключом не создал вторую оплату: оплат ${repeated.body?.payments?.length}`,
  );

  const full = await call(
    'POST',
    `/membership-periods/${periodId}/payments`,
    { amount: 15000, method: 'TRANSFER' },
  );
  check(full.body?.status === 'PAID', `после полной оплаты статус: ${full.body?.status}`);

  // --- Отмена оплаты пересчитывает период -------------------------------
  for (const payment of full.body?.payments ?? []) {
    await call('DELETE', `/payments/${payment.id}`);
  }
  const afterVoid = await call(
    'GET',
    `/athletes/${athleteId}/membership-periods/${year}/${month}`,
  );
  check(
    afterVoid.body?.paidAmount === 0 && afterVoid.body?.status === 'UNPAID',
    `отмена оплат вернула период в: ${afterVoid.body?.status}, оплачено ${afterVoid.body?.paidAmount}`,
  );

  // --- Задолженность: условие 3 не выполнено (занятий в месяце нет) -----
  const debts = await call('GET', `/debts?year=${year}&month=${month}`);
  const entry = (debts.body ?? []).find((item) => item.athleteId === athleteId);
  check(debts.status === 200, `список должников получен: ${debts.status}, всего ${debts.body?.length}`);
  check(
    entry?.isDebtor === false && entry?.reason === 'NO_TRAININGS_YET',
    `без занятий в месяце задолженности нет: ${entry?.reason ?? 'должник'}`,
  );

  // --- Условие 2: ручная отметка «оплачен полностью» (BR-003) -----------
  const marked = await call(
    'POST',
    `/membership-periods/${periodId}/fully-paid`,
    { marked: true },
  );
  check(marked.body?.status === 'FULLY_PAID_MARKED', `отметка дала статус: ${marked.body?.status}`);

  const markedDebts = await call('GET', `/debts?year=${year}&month=${month}`);
  const markedEntry = (markedDebts.body ?? []).find((item) => item.athleteId === athleteId);
  check(
    markedEntry?.isDebtor === false && markedEntry?.reason === 'MARKED_FULLY_PAID',
    `отметка освободила от задолженности: ${markedEntry?.reason}`,
  );

  const unmarked = await call(
    'POST',
    `/membership-periods/${periodId}/fully-paid`,
    { marked: false },
  );
  check(
    unmarked.body?.status !== 'FULLY_PAID_MARKED',
    `отметка снята, статус вернулся: ${unmarked.body?.status}`,
  );

  // --- Условие 4: заморозка (BR-005) ------------------------------------
  // Задолженность оценивается на начало месяца, поэтому заморозка должна
  // накрывать это начало: заморозка с середины месяца должником не делает
  // (см. открытый вопрос в docs/26-implementation-foundation.md).
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
    endedOn: calendar(addDays(freezeStart, 2)),
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
    endedOn: calendar(addDays(now, -5)),
  });
  check(
    invalidClose.status === 400 && invalidClose.body?.code === 'FREEZE_PERIOD_INVALID',
    `завершение раньше начала отклонено: ${invalidClose.status} ${invalidClose.body?.code}`,
  );

  // --- Очистка ----------------------------------------------------------
  await call('DELETE', `/groups/${group.body.id}`);
  console.log(`\nСоздано с меткой ${stamp}: группа, спортсмен, период, заморозки`);
}

main().catch((error) => {
  console.log('ERR', error.message);
  process.exitCode = 1;
});
