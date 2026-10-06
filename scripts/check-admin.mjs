/**
 * Разовая проверка админки по HTTP.
 *
 * Проверяет то, что нельзя подтвердить типами: страница входа отдается без
 * сессии, защищенные страницы перенаправляют на вход, вход через server action
 * устанавливает httpOnly-cookie, а прокси отдает данные backend от имени
 * пользователя.
 *
 * Скрытые поля формы (в том числе $ACTION_KEY) разбираются из HTML: в проде это
 * делает браузер, а в проверке — скрипт, поэтому формат не дублируется вручную.
 * Разбор и вход вынесены в `scripts/admin-check-client.mjs`: те же шаги нужны
 * проверке экранов финансов (`check-admin-finance.mjs`).
 *
 * Использование:
 *   node scripts/check-admin.mjs [baseUrl] [apiBaseUrl]
 */
import {
  DEFAULT_ADMIN_BASE,
  DEFAULT_API_BASE,
  apiCall,
  apiLogin,
  fetchHtml,
  loginCookies,
  readHiddenFields,
} from './admin-check-client.mjs';

const base = process.argv[2] ?? DEFAULT_ADMIN_BASE;
const apiBase = process.argv[3] ?? DEFAULT_API_BASE;
const email = process.env.ADMIN_EMAIL ?? 'superadmin@octagon.local';
const password = process.env.ADMIN_PASSWORD ?? 'ChangeMe-Octagon-2026!';

const log = (step, message) => console.log(`${step}. ${message}`);

/** Проверяет, что страница отдается и содержит ожидаемый текст. */
async function checkPage(cookie, path, expected, label) {
  const { status, html } = await fetchHtml(base, path, cookie);
  const found = html.includes(expected);
  console.log(
    `${found ? '✔' : '✕'} ${label}: ${path} → ${status}${
      found ? '' : ` (нет текста «${expected}»)`
    }`,
  );
}

async function main() {
  // 1. Страница входа доступна без сессии.
  const { status: loginStatus, html: loginHtml } = await fetchHtml(base, '/login', '');
  log(1, `/login: ${loginStatus} | форма входа: ${loginHtml.includes('name="email"')}`);

  // 2. Защищенные страницы без cookie отправляют на вход.
  const protectedPages = [
    '/',
    '/groups',
    '/athletes',
    '/users',
    '/finance',
    '/finance/debtors',
    '/finance/freezes',
  ];
  for (const path of protectedPages) {
    const response = await fetch(`${base}${path}`, { redirect: 'manual' });
    log(2, `${path} без сессии: ${response.status} → ${response.headers.get('location')}`);
  }

  // 3. Прокси без сессии не пропускает.
  const anonProxy = await fetch(`${base}/api/proxy/branches`, { redirect: 'manual' });
  log(3, `/api/proxy/branches без сессии: ${anonProxy.status}`);

  // 4. Вход: повторяем отправку формы браузером.
  const hidden = readHiddenFields(loginHtml);
  if (!hidden || hidden.size < 3) {
    log(4, 'НЕ НАЙДЕНЫ скрытые поля формы входа — формат server action изменился');
    return;
  }
  log(4, `скрытые поля формы: ${[...hidden.keys()].join(', ')}`);

  const session = await loginCookies({ base, email, password });
  const setCookie = session.setCookie;
  log(
    5,
    `вход: ${session.status} | redirect: ${session.location} | cookie: ${
      setCookie.map((cookie) => cookie.split('=')[0]).join(', ') || '(нет)'
    }`,
  );

  if (setCookie.length === 0) {
    log(6, 'сессия не установлена: защищенные страницы проверить нельзя');
    return;
  }

  log(
    6,
    `cookie httpOnly: ${setCookie.every((cookie) => /httponly/i.test(cookie))} | sameSite=lax: ${setCookie.some(
      (cookie) => /samesite=lax/i.test(cookie),
    )}`,
  );

  const cookie = session.cookie;

  // 7. Прокси отдает данные backend от имени пользователя.
  const viaProxy = await fetch(`${base}/api/proxy/branches`, { headers: { cookie } });
  log(7, `/api/proxy/branches: ${viaProxy.status}`);

  // 8. Экран обзора и разделы админки.
  await checkPage(cookie, '/', 'Права пользователя', 'обзор');
  await checkPage(cookie, '/branches', 'Новый филиал', 'филиалы');
  await checkPage(cookie, '/groups', 'Новая группа', 'группы');
  await checkPage(cookie, '/athletes', 'Новый спортсмен', 'спортсмены');
  await checkPage(cookie, '/users', 'Пользователи', 'пользователи');

  // 8б. Расписание: список шаблонов и список занятий.
  await checkPage(cookie, '/schedule', 'Расписание на квартал', 'расписание (шаблоны)');
  await checkPage(cookie, '/schedule/sessions', 'Занятия', 'занятия');

  // 8в. Карточка расписания со слотами.
  const templates = await (
    await fetch(`${base}/api/proxy/schedule-templates`, { headers: { cookie } })
  ).json();
  if (Array.isArray(templates) && templates.length > 0) {
    const { html } = await fetchHtml(base, `/schedule/${templates[0].id}`, cookie);
    const published = templates[0].publishedAt !== null;
    log(
      8,
      `карточка расписания (${published ? 'опубликовано' : 'черновик'}): слоты ${html.includes(
        'Слоты расписания',
      )} | публикация ${html.includes('Опубликовать расписание')} | генерация занятий ${html.includes(
        'Создать занятия из расписания',
      )}`,
    );
  } else {
    log(8, 'расписаний нет: карточку проверить нечем');
  }

  // 8г. Черновик: слоты можно менять, форма добавления видна. Проверяется на
  // будущем квартале, чтобы не мешать текущему расписанию.
  const draftToken = await apiLogin(apiBase, email, password);

  const groupsForDraft = await (
    await fetch(`${base}/api/proxy/groups`, { headers: { cookie } })
  ).json();
  if (Array.isArray(groupsForDraft) && groupsForDraft.length > 0 && draftToken) {
    const draftYear = new Date().getFullYear() + 1;
    const draft = await apiCall(apiBase, draftToken, 'POST', '/schedule-templates', {
      groupId: groupsForDraft[0].id,
      year: draftYear,
      quarter: 1,
    });

    if (draft.status === 201) {
      const created = draft.body;
      const { html } = await fetchHtml(base, `/schedule/${created.id}`, cookie);
      log(
        '8г',
        `черновик расписания (${draftYear} Q1): добавление слота ${html.includes(
          'Добавить слот',
        )} | кнопка публикации ${html.includes('Опубликовать расписание')}`,
      );
      // Удаляем черновик, чтобы не оставлять данные после проверки.
      await apiCall(apiBase, draftToken, 'DELETE', `/schedule-templates/${created.id}`);
    } else {
      log('8г', `черновик создать не удалось: ${draft.status}`);
    }
  }

  // 8д. Посещаемость занятия: журнал, отметки и предупреждения.
  const demoToken = await apiLogin(apiBase, email, password);

  if (demoToken) {
    const sessions = (await apiCall(apiBase, demoToken, 'GET', '/training-sessions')).body;

    // Нужно занятие с непустым составом: у групп, оставшихся от прошлых
    // проверок, участников может уже не быть.
    let reportable = null;
    let withAbsence = null;
    if (Array.isArray(sessions)) {
      for (const candidate of sessions.slice(0, 10)) {
        const journal = await apiCall(
          apiBase,
          demoToken,
          'GET',
          `/training-sessions/${candidate.id}/attendance`,
        );
        if (journal.status !== 200) {
          continue;
        }
        const roster = journal.body?.roster ?? [];
        if (roster.length > 0 && !reportable) {
          reportable = { session: candidate, rosterSize: roster.length };
        }
        if (roster.some((entry) => entry.plannedAbsence !== null) && !withAbsence) {
          withAbsence = { session: candidate };
        }
        if (reportable && withAbsence) {
          break;
        }
      }
    }

    if (reportable) {
      const { html } = await fetchHtml(
        base,
        `/schedule/sessions/${reportable.session.id}/attendance`,
        cookie,
      );
      log(
        '8д',
        `журнал занятия (${reportable.rosterSize} спортсменов): заголовок ${html.includes(
          'Посещаемость:',
        )} | кнопки отметок ${html.includes('Уваж.')} | форма предупреждения ${html.includes(
          'Сообщить о планируемом отсутствии',
        )}`,
      );
    } else {
      log('8д', 'занятия с непустым составом не найдены: журнал проверить нечем');
    }

    if (withAbsence) {
      const { html } = await fetchHtml(
        base,
        `/schedule/sessions/${withAbsence.session.id}/attendance`,
        cookie,
      );
      log(
        '8е',
        `предупреждения об отсутствии: баннер ${html.includes(
          'Предупреждения об отсутствии',
        )} | пометка в списке ${html.includes('предупредил')} | подпись про итог тренера ${html.includes(
          'итог подтверждает тренер',
        )}`,
      );
    } else {
      log('8е', 'занятий с предупреждениями нет: баннер проверить нечем');
    }
  }

  // 9. Карточка группы: филиалы, тренеры, состав.
  const groups = await (await fetch(`${base}/api/proxy/groups`, { headers: { cookie } })).json();
  if (Array.isArray(groups) && groups.length > 0) {
    const { html } = await fetchHtml(base, `/groups/${groups[0].id}`, cookie);
    log(
      9,
      `карточка группы: филиалы ${html.includes('Филиалы')} | тренеры ${html.includes(
        'Тренеры',
      )} | состав ${html.includes('Состав')} | добавление участника ${html.includes(
        'Добавить спортсмена',
      )}`,
    );
  } else {
    log(9, 'групп нет: карточку группы проверить нечем');
  }

  // 10. Карточка спортсмена: связи аккаунтов.
  const athletes = await (
    await fetch(`${base}/api/proxy/athletes`, { headers: { cookie } })
  ).json();
  if (Array.isArray(athletes) && athletes.length > 0) {
    const { html } = await fetchHtml(base, `/athletes/${athletes[0].id}`, cookie);
    log(
      10,
      `карточка спортсмена: связи аккаунтов ${html.includes(
        'Связанные аккаунты',
      )} | форма карточки ${html.includes('Карточка')} | архивирование ${html.includes(
        'Архивировать спортсмена',
      )}`,
    );
  } else {
    log(10, 'спортсменов нет: карточку проверить нечем');
  }

  // 11. Права пользователя: ролевые и индивидуальные показаны раздельно.
  const token = await apiLogin(apiBase, email, password);

  const me = (await apiCall(apiBase, token, 'GET', '/me')).body;
  const usersCount = (await apiCall(apiBase, token, 'GET', '/users?perPage=100')).body;

  const { html: permissionsHtml } = await fetchHtml(base, `/users/${me.id}/permissions`, cookie);
  log(
    11,
    `права: ролевые ${permissionsHtml.includes('Права роли')} | личные ${permissionsHtml.includes(
      'Выдано лично',
    )} | итог ${permissionsHtml.includes('Итоговый набор прав')}`,
  );
  log(
    12,
    `/users как API: всего ${usersCount.meta?.total} | на странице ${usersCount.items?.length} | приватные поля: ${
      usersCount.items?.[0]?.passwordHash === undefined ? 'не раскрыты' : 'УТЕЧКА'
    }`,
  );

  // 13. Финансы: сводка месяца, список должников, заморозки.
  //
  // Подробная проверка (периоды, оплаты через форму, BR-003 и BR-005) —
  // отдельным скриптом `check-admin-finance.mjs`: здесь только то, что экраны
  // отдаются и объясняют правила.
  const today = new Date();
  const financeYear = today.getUTCFullYear();
  const financeMonth = today.getUTCMonth() + 1;

  await checkPage(cookie, '/finance', 'Финансы', 'финансы (сводка)');
  await checkPage(cookie, '/finance/debtors', 'Не должники', 'финансы (должники)');
  await checkPage(cookie, '/finance/freezes', 'Заморозки', 'финансы (заморозки)');

  const financeHtml = await fetchHtml(
    base,
    `/finance?year=${financeYear}&month=${financeMonth}`,
    cookie,
  );
  log(
    13,
    `сводка финансов: выручка ${financeHtml.html.includes('Выручка за месяц')} | филиалы ${financeHtml.html.includes(
      'Сравнение филиалов',
    )} | правила BR-004 ${financeHtml.html.includes(
      'Как считается задолженность',
    )} | месяц в адресе ${financeHtml.html.includes(String(financeYear))}`,
  );

  // 14. Приглашения: полный цикл «создать → открыть ссылку → задать пароль → войти».
  //
  // Проверяется именно цикл, а не отдельные эндпоинты: приглашение бессмысленно,
  // если ссылка не открывается или по ней нельзя войти. Пользователь создается
  // каждый раз новый: повторное приглашение на занятый адрес отклоняется.
  const inviteStamp = Date.now();
  const inviteEmail = `invite-${inviteStamp}@octagon.local`;
  const invitePassword = 'Invite-Check-2026!';

  const created = await apiCall(apiBase, token, 'POST', '/users/invites', {
    email: inviteEmail,
    role: 'STAFF',
  });
  log(
    14,
    `приглашение создано: ${created.status} | роль ${created.body?.role} | токен ${
      typeof created.body?.token === 'string' && created.body.token.length >= 32
        ? 'выдан'
        : 'НЕ ВЫДАН'
    }`,
  );

  const invitesList = await apiCall(apiBase, token, 'GET', '/users/invites');
  log(
    '14б',
    `список приглашений: всего ${invitesList.body?.length} | хеш токена ${
      JSON.stringify(invitesList.body ?? []).includes('tokenHash') ? 'УТЕЧКА' : 'не раскрыт'
    }`,
  );

  const { html: invitesHtml } = await fetchHtml(base, '/users/invites', cookie);
  log(
    '14в',
    `экран приглашений: форма ${invitesHtml.includes('Пригласить пользователя')} | доставка вручную ${invitesHtml.includes(
      'Письмо не отправляется',
    )} | список ${invitesHtml.includes('Действующие приглашения')}`,
  );

  const inviteToken = created.body?.token;
  if (inviteToken) {
    const preview = await apiCall(
      apiBase,
      '',
      'GET',
      `/auth/invites/${encodeURIComponent(inviteToken)}`,
    );
    log(
      '14г',
      `просмотр по ссылке без сессии: ${preview.status} | email ${
        preview.body?.email === inviteEmail ? 'совпадает' : 'НЕ СОВПАДАЕТ'
      } | хеш ${JSON.stringify(preview.body ?? {}).includes('tokenHash') ? 'УТЕЧКА' : 'не раскрыт'}`,
    );

    const { html: invitePageHtml, status: invitePageStatus } = await fetchHtml(
      base,
      `/invite/${inviteToken}`,
      '',
    );
    log(
      '14д',
      `страница принятия без сессии: ${invitePageStatus} | форма ${invitePageHtml.includes(
        'Создать аккаунт',
      )} | адрес показан ${invitePageHtml.includes(inviteEmail)}`,
    );

    const accepted = await apiCall(apiBase, '', 'POST', '/auth/accept-invite', {
      token: inviteToken,
      email: inviteEmail,
      password: invitePassword,
      firstName: 'Приглашенный',
      lastName: `Проверка ${inviteStamp}`,
    });
    log('14е', `приглашение принято: ${accepted.status} | роль ${accepted.body?.role}`);

    // Главное: по приглашению действительно можно войти.
    const inviteLogin = await apiCall(apiBase, '', 'POST', '/auth/login', {
      email: inviteEmail,
      password: invitePassword,
    });
    log(
      '14ж',
      `вход приглашенного: ${inviteLogin.status} | роль ${inviteLogin.body?.user?.role} | прав ${
        inviteLogin.body?.user?.permissions?.codes?.length ?? '—'
      }`,
    );

    const reused = await apiCall(apiBase, '', 'POST', '/auth/accept-invite', {
      token: inviteToken,
      email: inviteEmail,
      password: 'Another-Password-2026!',
      firstName: 'Повтор',
      lastName: 'Повтор',
    });
    log('14з', `повторное принятие отклонено: ${reused.status} ${reused.body?.code ?? ''}`);

    const unknownToken = await apiCall(
      apiBase,
      '',
      'GET',
      '/auth/invites/unknown-token-0123456789',
    );
    log(
      '14и',
      `неизвестный токен не отличается от истекшего: ${unknownToken.status} ${unknownToken.body?.code ?? ''}`,
    );

    const secondInvite = await apiCall(apiBase, token, 'POST', '/users/invites', {
      email: inviteEmail,
      role: 'STAFF',
    });
    log(
      '14к',
      `повторное приглашение занятого адреса отклонено: ${secondInvite.status} ${secondInvite.body?.code ?? ''}`,
    );
  }
}

main().catch((error) => {
  console.log('ERR', error.message);
  process.exitCode = 1;
});
