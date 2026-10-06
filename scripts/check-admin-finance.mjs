/**
 * Живая проверка экранов финансов в админке.
 *
 * Проверяет то, что нельзя подтвердить типами и нельзя увидеть в тестах без
 * браузера:
 * - разделы финансов доступны только с финансовым правом (BR-010);
 * - список должников показывает и должников, и причины освобождения (BR-004);
 * - период заводится при первом обращении к месяцу, и после этого на карточке
 *   появляются формы оплаты;
 * - **оплата, отправленная формой админки, действительно попадает в БД** и
 *   пересчитывает статус периода (BR-002, BR-003);
 * - заморозка (BR-005) видна в карточке спортсмена и на экране заморозок.
 *
 * Проверка работает и как репетиция сценария: она создает спортсмена, группу и
 * занятие задним числом, потому что задолженность без состоявшейся тренировки
 * не возникает (BR-004, условие 3).
 *
 * Использование:
 *   node scripts/check-admin-finance.mjs [adminBaseUrl] [apiBaseUrl]
 */
import {
  DEFAULT_ADMIN_BASE,
  DEFAULT_API_BASE,
  apiCall,
  apiLogin,
  fetchHtml,
  loginCookies,
  readActionForm,
} from './admin-check-client.mjs';

const admin = process.argv[2] ?? DEFAULT_ADMIN_BASE;
const api = process.argv[3] ?? DEFAULT_API_BASE;
const stamp = Date.now();

const now = new Date();
// Расчетный месяц должен содержать прошедший день: занятие заносится задним
// числом. Если сегодня первое или второе число, берем предыдущий месяц.
const billing = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (now.getUTCDate() < 3 ? 1 : 0), 1),
);
const year = billing.getUTCFullYear();
const month = billing.getUTCMonth() + 1;
const sessionDate = `${year}-${String(month).padStart(2, '0')}-05`;
const joinDate = `${year}-${String(month).padStart(2, '0')}-01`;
// Задолженность оценивается на начало месяца, поэтому заморозка, освобождающая
// от нее, должна начаться не позже первого числа (BR-004, условие 4). Заморозка
// с середины месяца должником не делает, но и не освобождает.
const freezeStart = new Date(billing);
freezeStart.setUTCDate(freezeStart.getUTCDate() - 3);
const freezeStartDate = freezeStart.toISOString().slice(0, 10);

let failures = 0;
const check = (ok, message) => {
  if (!ok) {
    failures += 1;
  }
  console.log(`${ok ? '✔' : '✕'} ${message}`);
};

async function main() {
  const session = await loginCookies({ base: admin });
  check(Boolean(session.cookie), `вход в админку: ${session.status} → ${session.location}`);
  if (!session.cookie) {
    return;
  }
  const cookie = session.cookie;
  const token = await apiLogin(api);

  // Защищенные разделы без cookie не отдают данные.
  for (const path of ['/finance', '/finance/debtors', '/finance/freezes']) {
    const anonymous = await fetchHtml(admin, path, '');
    check(
      anonymous.status === 307 || anonymous.status === 302,
      `${path} без сессии: ${anonymous.status} → ${anonymous.location ?? '—'}`,
    );
  }

  // --- Подготовка данных ----------------------------------------------------
  const group = (
    await apiCall(api, token, 'POST', '/groups', { name: `Группа экранов финансов ${stamp}` })
  ).body;
  const athlete = (
    await apiCall(api, token, 'POST', '/athletes', {
      firstName: 'Экранный',
      lastName: `Финансист ${stamp}`,
    })
  ).body;
  await apiCall(api, token, 'POST', `/groups/${group.id}/members`, {
    athleteId: athlete.id,
    joinedAt: joinDate,
  });
  await apiCall(api, token, 'POST', '/training-sessions', {
    groupId: group.id,
    date: sessionDate,
    startTime: '18:00',
    endTime: '19:30',
    reason: `Проверка экранов финансов ${stamp}`,
  });
  check(Boolean(athlete?.id), `подготовлен спортсмен: ${athlete?.lastName}`);

  // --- Сводка месяца --------------------------------------------------------
  const finance = await fetchHtml(admin, `/finance?year=${year}&month=${month}`, cookie);
  check(finance.status === 200, `сводка финансов отдается: ${finance.status}`);
  check(
    finance.html.includes('Финансы') && finance.html.includes('Должников'),
    'сводка месяца: заголовок и карточка должников',
  );
  check(
    finance.html.includes('Как считается задолженность'),
    'сводка объясняет правила BR-004',
  );
  check(finance.html.includes('Финансы'), 'раздел «Финансы» есть в навигации админки');
  check(!finance.html.includes('Доступен только просмотр: нет права'), 'разделы доступны суперадмину');

  // --- Список должников: причины освобождения (BR-004) ----------------------
  const debtors = await fetchHtml(admin, `/finance/debtors?year=${year}&month=${month}`, cookie);
  check(debtors.status === 200, `список должников отдается: ${debtors.status}`);
  check(
    debtors.html.includes(`Финансист ${stamp}`),
    'подготовленный спортсмен виден в списке должников',
  );
  check(
    debtors.html.includes('Не должники') && debtors.html.includes('Освобождение — это решение'),
    'освобожденные вынесены отдельной таблицей с пояснением',
  );
  check(
    debtors.html.includes('не задана') || debtors.html.includes('₸'),
    'суммы периода показаны',
  );

  // --- Карточка спортсмена: период и формы ---------------------------------
  const cardUrl = `/finance/athletes/${athlete.id}?year=${year}&month=${month}`;
  const before = await fetchHtml(admin, cardUrl, cookie);
  check(before.status === 200, `карточка финансов спортсмена отдается: ${before.status}`);
  check(before.html.includes('Расчетные периоды'), 'карточка показывает расчетные периоды');
  check(
    before.html.includes('периодов еще нет'),
    'карточка объясняет, что периодов за год пока нет',
  );

  // Период заводится при первом обращении: воспроизводим переход по ссылке.
  await apiCall(api, token, 'GET', `/athletes/${athlete.id}/membership-periods/${year}/${month}`);

  const opened = await fetchHtml(admin, cardUrl, cookie);
  const paymentForm = readActionForm(opened.html, 'name="idempotencyKey"');
  check(Boolean(paymentForm), 'форма внесения оплаты появилась после заведения периода');
  check(
    opened.html.includes('Ожидаемая сумма') && opened.html.includes('Отметить оплаченным полностью'),
    'доступны изменение ожидаемой суммы и ручная отметка (BR-002, BR-003)',
  );

  // --- Оплата через форму админки ------------------------------------------
  if (paymentForm) {
    const form = new FormData();
    for (const [name, value] of paymentForm.fields) {
      form.set(name, value);
    }
    form.set('amount', '12000');
    form.set('method', 'CARD');
    form.set('paidAt', sessionDate);
    form.set('comment', `Оплата из проверки админки ${stamp}`);

    const submitted = await fetch(`${admin}${cardUrl}`, {
      method: 'POST',
      body: form,
      headers: { cookie, origin: admin, accept: 'text/x-component' },
    });
    check(submitted.status === 200, `отправка формы оплаты: ${submitted.status}`);

    const period = await apiCall(
      api,
      token,
      'GET',
      `/athletes/${athlete.id}/membership-periods/${year}/${month}`,
    );
    check(
      period.body?.paidAmount === 12000 && period.body?.status === 'PAID',
      `оплата из формы попала в БД: внесено ${period.body?.paidAmount}, статус ${period.body?.status}`,
    );

    const after = await fetchHtml(admin, cardUrl, cookie);
    check(after.html.includes('12 000'), 'сумма оплаты отображается в карточке');
    check(after.html.includes('карта'), 'способ оплаты отображается по-русски');
  }

  // --- Заморозка (BR-005) ---------------------------------------------------
  const freeze = (
    await apiCall(api, token, 'POST', `/athletes/${athlete.id}/freezes`, {
      startedOn: freezeStartDate,
      reason: `Проверка экрана заморозок ${stamp}`,
    })
  ).body;
  check(
    freeze?.isOpen === true,
    `заморозка открыта задним числом с ${freezeStartDate}: ${freeze?.startedOn}`,
  );

  const frozenCard = await fetchHtml(admin, `/finance/athletes/${athlete.id}`, cookie);
  check(
    frozenCard.html.includes('Спортсмен в заморозке') && frozenCard.html.includes('Завершить заморозку'),
    'карточка показывает открытую заморозку и форму завершения',
  );

  const freezeScreen = await fetchHtml(admin, `/finance/freezes?athleteId=${athlete.id}`, cookie);
  check(freezeScreen.status === 200, `экран заморозок отдается: ${freezeScreen.status}`);
  check(
    freezeScreen.html.includes(`Финансист ${stamp}`) && freezeScreen.html.includes('открыта'),
    'экран заморозок показывает выбранного спортсмена и открытую заморозку',
  );
  check(
    freezeScreen.html.includes('Вторая одновременная заморозка запрещена'),
    'вторая заморозка не предлагается, пока открыта первая',
  );

  const frozenDebts = await apiCall(api, token, 'GET', `/debts?year=${year}&month=${month}`);
  const frozenEntry = (frozenDebts.body ?? []).find((item) => item.athleteId === athlete.id);
  check(
    frozenEntry?.isDebtor === false && frozenEntry?.reason === 'FROZEN',
    `заморозка освободила от задолженности: ${frozenEntry?.reason}`,
  );

  const debtorsAfterFreeze = await fetchHtml(
    admin,
    `/finance/debtors?year=${year}&month=${month}`,
    cookie,
  );
  check(
    debtorsAfterFreeze.html.includes('в заморозке'),
    'причина «в заморозке» видна в списке должников',
  );

  // --- Уборка ---------------------------------------------------------------
  await apiCall(api, token, 'POST', `/freezes/${freeze?.id}/close`, { endedOn: joinDate });
  await apiCall(api, token, 'DELETE', `/groups/${group.id}`);

  console.log(
    `\nРасчетный месяц: ${year}-${String(month).padStart(2, '0')}, занятие: ${sessionDate}, заморозка с ${freezeStartDate} (метка ${stamp})`,
  );
}

main()
  .then(() => {
    if (failures > 0) {
      console.log(`\nПровалено утверждений: ${failures}`);
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.log('ERR', error.message);
    process.exitCode = 1;
  });
