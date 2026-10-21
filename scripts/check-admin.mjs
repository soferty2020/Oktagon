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

  // 15. Новости: черновик, публикация, комментарии и модерация (BR-011, ADR-0011).
  //
  // Ключевое, что проверяется здесь, — что чтение не требует прав, а действия их
  // требуют. Для этого используется пользователь без единого права (MEMBER):
  // ему доступна лента, но не создание новостей.
  const newsStamp = Date.now();

  const memberEmail = `news-reader-${newsStamp}@octagon.local`;
  const memberPassword = 'News-Reader-2026!';
  const memberInvite = await apiCall(apiBase, token, 'POST', '/users/invites', {
    email: memberEmail,
    role: 'MEMBER',
  });
  const memberAccept = await apiCall(apiBase, '', 'POST', '/auth/accept-invite', {
    token: memberInvite.body?.token,
    email: memberEmail,
    password: memberPassword,
    firstName: 'Читатель',
    lastName: `Новостей ${newsStamp}`,
  });
  const memberLogin = await apiCall(apiBase, '', 'POST', '/auth/login', {
    email: memberEmail,
    password: memberPassword,
  });
  const memberToken = memberLogin.body?.accessToken ?? '';
  log(
    15,
    `читатель без прав подготовлен: ${memberAccept.status} | прав ${
      memberLogin.body?.user?.permissions?.codes?.length ?? '—'
    }`,
  );

  const draft = await apiCall(apiBase, token, 'POST', '/news', {
    title: `Черновик ${newsStamp}`,
    body: 'Текст черновика',
  });
  log(
    '15б',
    `черновик создан: ${draft.status} | статус ${draft.body?.status} | publishedAt ${
      draft.body?.publishedAt ?? 'нет'
    }`,
  );

  const memberSeesDraft = await apiCall(apiBase, memberToken, 'GET', '/news');
  log(
    '15в',
    `читатель не видит черновик в ленте: ${
      (memberSeesDraft.body ?? []).some((item) => item.id === draft.body?.id) ? 'ВИДИТ' : 'не видит'
    }`,
  );

  const memberCreates = await apiCall(apiBase, memberToken, 'POST', '/news', {
    title: 'Попытка',
    body: 'Текст',
  });
  log(
    '15г',
    `создание без права news.create отклонено: ${memberCreates.status} ${memberCreates.body?.code ?? ''}`,
  );

  const foreignDraft = await apiCall(apiBase, memberToken, 'GET', `/news/${draft.body?.id}`);
  log(
    '15д',
    `чужой черновик отдает ${foreignDraft.status} (не 403: существование не раскрывается)`,
  );

  const commentOnDraft = await apiCall(apiBase, token, 'POST', `/news/${draft.body?.id}/comments`, {
    body: 'Комментарий к черновику',
  });
  log(
    '15е',
    `комментарий к черновику отклонен: ${commentOnDraft.status} ${commentOnDraft.body?.code ?? ''}`,
  );

  const published = await apiCall(apiBase, token, 'POST', `/news/${draft.body?.id}/publish`);
  log('15ж', `черновик опубликован: ${published.status} | статус ${published.body?.status}`);

  const memberSeesPublished = await apiCall(apiBase, memberToken, 'GET', `/news/${draft.body?.id}`);
  log(
    '15з',
    `опубликованная новость видна без прав: ${memberSeesPublished.status} | комментариев ${
      memberSeesPublished.body?.comments?.length ?? '—'
    }`,
  );

  const memberComment = await apiCall(
    apiBase,
    memberToken,
    'POST',
    `/news/${draft.body?.id}/comments`,
    { body: 'Комментарий читателя' },
  );
  log(
    '15и',
    `читатель комментирует без прав (BR-011): ${memberComment.status} | canDelete ${
      memberComment.body?.canDelete
    }`,
  );

  const authorComment = await apiCall(apiBase, token, 'POST', `/news/${draft.body?.id}/comments`, {
    body: 'Комментарий администратора',
  });

  const memberDeletesForeign = await apiCall(
    apiBase,
    memberToken,
    'DELETE',
    `/news-comments/${authorComment.body?.id}`,
  );
  log(
    '15к',
    `чужой комментарий без news.moderate не удаляется: ${memberDeletesForeign.status} ${
      memberDeletesForeign.body?.code ?? ''
    }`,
  );

  const moderatorDeletes = await apiCall(
    apiBase,
    token,
    'DELETE',
    `/news-comments/${authorComment.body?.id}`,
  );
  log(
    '15л',
    `модератор удаляет чужой комментарий: ${moderatorDeletes.status} | isDeleted ${
      moderatorDeletes.body?.isDeleted
    }`,
  );

  const afterDelete = await apiCall(apiBase, memberToken, 'GET', `/news/${draft.body?.id}`);
  const deletedComment = (afterDelete.body?.comments ?? []).find(
    (item) => item.id === authorComment.body?.id,
  );
  log(
    '15м',
    `удаленный комментарий остается следом: isDeleted ${deletedComment?.isDeleted} | текст ${
      deletedComment?.body === '' ? 'скрыт' : 'РАСКРЫТ'
    }`,
  );

  const archived = await apiCall(apiBase, token, 'DELETE', `/news/${draft.body?.id}`);
  log(
    '15н',
    `архивирование: ${archived.status} | статус ${archived.body?.status} | из ленты ${
      ((await apiCall(apiBase, memberToken, 'GET', '/news')).body ?? []).some(
        (item) => item.id === draft.body?.id,
      )
        ? 'ОСТАЛАСЬ'
        : 'убрана'
    }`,
  );

  const editArchived = await apiCall(apiBase, token, 'PATCH', `/news/${draft.body?.id}`, {
    title: 'Правка архива',
  });
  log(
    '15о',
    `правка архивной новости отклонена: ${editArchived.status} ${editArchived.body?.code ?? ''}`,
  );

  const { html: newsHtml } = await fetchHtml(base, '/news', cookie);
  const memberSession = await loginCookies({ base, email: memberEmail, password: memberPassword });
  const { html: memberNewsHtml } = await fetchHtml(base, '/news', memberSession.cookie);
  log(
    '15п',
    `экран новостей: лента ${newsHtml.includes('Новая публикация')} | у читателя без прав формы нет ${
      memberNewsHtml.includes('Новая публикация') ? 'ЕСТЬ' : 'нет'
    }`,
  );

  // 16. Тренеры: профиль, привязка аккаунта и проверка роли.
  //
  // Проверяется то, чего раньше нельзя было сделать из интерфейса: связать
  // существующий профиль с аккаунтом. До этого связь задавалась только при
  // создании, и профиль, заведенный заранее, оставался без доступа в систему.
  const trainerStamp = Date.now();

  const trainerProfile = await apiCall(apiBase, token, 'POST', '/trainers', {
    displayName: `Тренер экрана ${trainerStamp}`,
  });
  log(
    16,
    `профиль тренера без аккаунта: ${trainerProfile.status} | userId ${
      trainerProfile.body?.userId ?? 'нет'
    }`,
  );

  // Аккаунт сотрудника: подходит для привязки.
  const staffEmail = `trainer-page-staff-${trainerStamp}@octagon.local`;
  const staffPassword = 'Trainer-Page-2026!';
  const staffInvite = await apiCall(apiBase, token, 'POST', '/users/invites', {
    email: staffEmail,
    role: 'STAFF',
  });
  const staffAccept = await apiCall(apiBase, '', 'POST', '/auth/accept-invite', {
    token: staffInvite.body?.token,
    email: staffEmail,
    password: staffPassword,
    firstName: 'Сотрудник',
    lastName: `Экрана ${trainerStamp}`,
  });

  // Участник клуба: тренером быть не может, у него нет прав на занятия.
  const pageMemberInvite = await apiCall(apiBase, token, 'POST', '/users/invites', {
    email: `trainer-page-member-${trainerStamp}@octagon.local`,
    role: 'MEMBER',
  });
  const pageMemberAccept = await apiCall(apiBase, '', 'POST', '/auth/accept-invite', {
    token: pageMemberInvite.body?.token,
    email: `trainer-page-member-${trainerStamp}@octagon.local`,
    password: 'Trainer-Page-Member-2026!',
    firstName: 'Участник',
    lastName: `Экрана ${trainerStamp}`,
  });

  const linkMember = await apiCall(
    apiBase,
    token,
    'POST',
    `/trainers/${trainerProfile.body?.id}/account`,
    { userId: pageMemberAccept.body?.userId },
  );
  log(
    '16б',
    `участник клуба не привязывается к тренеру: ${linkMember.status} ${
      linkMember.body?.code ?? ''
    }`,
  );

  const linked = await apiCall(
    apiBase,
    token,
    'POST',
    `/trainers/${trainerProfile.body?.id}/account`,
    {
      userId: staffAccept.body?.userId,
    },
  );
  log(
    '16в',
    `аккаунт сотрудника привязан: ${linked.status} | userId ${
      linked.body?.userId === staffAccept.body?.userId ? 'совпадает' : 'НЕ СОВПАДАЕТ'
    }`,
  );

  const linkedAgain = await apiCall(
    apiBase,
    token,
    'POST',
    `/trainers/${trainerProfile.body?.id}/account`,
    { userId: staffAccept.body?.userId },
  );
  log('16г', `повторная привязка того же аккаунта не ошибка: ${linkedAgain.status}`);

  const unlinked = await apiCall(
    apiBase,
    token,
    'DELETE',
    `/trainers/${trainerProfile.body?.id}/account`,
  );
  log(
    '16д',
    `связь снята, профиль сохранен: ${unlinked.status} | userId ${
      unlinked.body?.userId ?? 'нет'
    } | профиль ${unlinked.body?.id === trainerProfile.body?.id ? 'тот же' : 'ПОТЕРЯН'}`,
  );

  const unlinkAgain = await apiCall(
    apiBase,
    token,
    'DELETE',
    `/trainers/${trainerProfile.body?.id}/account`,
  );
  log('16е', `повторная отвязка отклонена: ${unlinkAgain.status} ${unlinkAgain.body?.code ?? ''}`);

  const { html: trainersHtml } = await fetchHtml(base, '/trainers', cookie);
  log(
    '16ж',
    `экран тренеров: список ${trainersHtml.includes('Тренеры')} | форма создания ${trainersHtml.includes(
      'Новый тренер',
    )} | статус доступа ${trainersHtml.includes('без аккаунта') || trainersHtml.includes('аккаунт привязан')}`,
  );

  // Тренер с привязанным аккаунтом попадает в чат своей группы: это и есть
  // практический смысл связи, ради которой экран и сделан.
  const group = await apiCall(apiBase, token, 'POST', '/groups', {
    name: `Группа тренера ${trainerStamp}`,
  });
  await apiCall(apiBase, token, 'POST', `/groups/${group.body?.id}/trainers`, {
    trainerId: trainerProfile.body?.id,
  });

  const staffLogin = await apiCall(apiBase, '', 'POST', '/auth/login', {
    email: staffEmail,
    password: staffPassword,
  });
  const staffToken = staffLogin.body?.accessToken ?? '';

  const chatWithoutLink = await apiCall(apiBase, staffToken, 'POST', '/conversations', {
    groupId: group.body?.id,
  });

  await apiCall(apiBase, token, 'POST', `/trainers/${trainerProfile.body?.id}/account`, {
    userId: staffAccept.body?.userId,
  });
  const chatWithLink = await apiCall(apiBase, staffToken, 'POST', '/conversations', {
    groupId: group.body?.id,
  });
  log(
    '16з',
    `связь влияет на доступ к чату группы: без связи ${chatWithoutLink.status}, со связью ${chatWithLink.status}`,
  );

  // 17. Залы: правка, конфликт названий, перенос между филиалами и архивирование.
  //
  // До этого залы можно было только выбрать в расписании: создать, переименовать
  // или закрыть их из интерфейса было нельзя, и зал, заведенный с ошибкой,
  // исправить было нечем.
  const hallStamp = Date.now();

  const firstBranch = await apiCall(apiBase, token, 'POST', '/branches', {
    name: `Филиал залов А ${hallStamp}`,
  });
  const secondBranch = await apiCall(apiBase, token, 'POST', '/branches', {
    name: `Филиал залов Б ${hallStamp}`,
  });

  const hall = await apiCall(apiBase, token, 'POST', `/branches/${firstBranch.body?.id}/halls`, {
    name: `Зал ${hallStamp}`,
    capacity: 25,
  });
  log('17', `зал создан: ${hall.status} | вместимость ${hall.body?.capacity}`);

  const duplicateHall = await apiCall(
    apiBase,
    token,
    'POST',
    `/branches/${firstBranch.body?.id}/halls`,
    { name: `Зал ${hallStamp}` },
  );
  log(
    '17б',
    `дубль названия в филиале отклонен: ${duplicateHall.status} ${duplicateHall.body?.code ?? ''}`,
  );

  const sameNameOtherBranch = await apiCall(
    apiBase,
    token,
    'POST',
    `/branches/${secondBranch.body?.id}/halls`,
    { name: `Зал ${hallStamp}` },
  );
  log('17в', `то же название в другом филиале разрешено: ${sameNameOtherBranch.status}`);

  const renamed = await apiCall(apiBase, token, 'PATCH', `/halls/${hall.body?.id}`, {
    name: `Зал ${hallStamp} переименован`,
    capacity: 30,
  });
  log(
    '17г',
    `зал переименован: ${renamed.status} | имя ${
      renamed.body?.name === `Зал ${hallStamp} переименован` ? 'новое' : 'СТАРОЕ'
    } | вместимость ${renamed.body?.capacity}`,
  );

  const moved = await apiCall(apiBase, token, 'PATCH', `/halls/${hall.body?.id}`, {
    branchId: secondBranch.body?.id,
  });
  log(
    '17д',
    `зал перенесен в другой филиал: ${moved.status} | филиал ${
      moved.body?.branchId === secondBranch.body?.id ? 'новый' : 'СТАРЫЙ'
    }`,
  );

  // Занятие в зале: архивирование должно быть отклонено, иначе группа придет в
  // закрытый зал. Дата в будущем, чтобы занятие считалось предстоящим.
  const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // `branchId` в создании группы не передается: этого поля нет в контракте,
  // филиал группы задается отдельно (первичная группа).
  const groupForHall = await apiCall(apiBase, token, 'POST', '/groups', {
    name: `Группа зала ${hallStamp}`,
  });
  const sessionInHall = await apiCall(apiBase, token, 'POST', '/training-sessions', {
    groupId: groupForHall.body?.id,
    date: futureDate,
    startTime: '10:00',
    endTime: '11:00',
    hallId: hall.body?.id,
    // Причина обязательна: занятие заводится вручную и попадает в аудит.
    reason: 'Проверка зала',
  });
  log('17е', `занятие в зале создано: ${sessionInHall.status}`);

  const archiveBusy = await apiCall(apiBase, token, 'DELETE', `/halls/${hall.body?.id}`);
  log(
    '17ж',
    `архивирование зала с занятием отклонено: ${archiveBusy.status} ${
      archiveBusy.body?.code ?? ''
    }`,
  );

  const freeHall = await apiCall(
    apiBase,
    token,
    'POST',
    `/branches/${firstBranch.body?.id}/halls`,
    {
      name: `Свободный зал ${hallStamp}`,
    },
  );
  const archiveFree = await apiCall(apiBase, token, 'DELETE', `/halls/${freeHall.body?.id}`);
  log('17з', `архивирование зала без занятий: ${archiveFree.status}`);

  const { html: branchesHtml } = await fetchHtml(base, '/branches', cookie);
  log(
    '17и',
    `экран филиалов: залы ${branchesHtml.includes(`Зал ${hallStamp}`)} | форма добавления ${
      branchesHtml.includes('Добавить зал') ? 'есть' : 'НЕТ'
    } | правка ${branchesHtml.includes('Сохранить зал') ? 'есть' : 'НЕТ'}`,
  );
}

main().catch((error) => {
  console.log('ERR', error.message);
  process.exitCode = 1;
});
