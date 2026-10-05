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
 *
 * Использование:
 *   node scripts/check-admin.mjs [baseUrl] [apiBaseUrl]
 */
const base = process.argv[2] ?? 'http://127.0.0.1:3001';
const apiBase = process.argv[3] ?? 'http://127.0.0.1:3900/api/v1';
const email = process.env.ADMIN_EMAIL ?? 'superadmin@octagon.local';
const password = process.env.ADMIN_PASSWORD ?? 'ChangeMe-Octagon-2026!';

const log = (step, message) => console.log(`${step}. ${message}`);

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Скрытые поля формы входа: их формирует useActionState. */
function readHiddenFields(html) {
  const form = html.match(/<form[\s\S]*?<\/form>/)?.[0];
  if (!form) {
    return null;
  }

  const fields = new Map();
  for (const match of form.matchAll(
    /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g,
  )) {
    fields.set(match[1], decodeHtml(match[2] ?? ''));
  }
  return fields;
}

async function fetchHtml(path, cookie) {
  const response = await fetch(`${base}${path}`, { headers: cookie ? { cookie } : {} });
  return { status: response.status, html: await response.text() };
}

/** Проверяет, что страница отдается и содержит ожидаемый текст. */
async function checkPage(cookie, path, expected, label) {
  const { status, html } = await fetchHtml(path, cookie);
  const found = html.includes(expected);
  console.log(
    `${found ? '✔' : '✕'} ${label}: ${path} → ${status}${
      found ? '' : ` (нет текста «${expected}»)`
    }`,
  );
}

async function main() {
  // 1. Страница входа доступна без сессии.
  const { status: loginStatus, html: loginHtml } = await fetchHtml('/login');
  log(1, `/login: ${loginStatus} | форма входа: ${loginHtml.includes('name="email"')}`);

  // 2. Защищенные страницы без cookie отправляют на вход.
  for (const path of ['/', '/groups', '/athletes', '/users']) {
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

  const form = new FormData();
  for (const [name, value] of hidden) {
    form.set(name, value);
  }
  form.set('email', email);
  form.set('password', password);

  const post = await fetch(`${base}/login`, {
    method: 'POST',
    body: form,
    redirect: 'manual',
    headers: { accept: 'text/x-component' },
  });

  const setCookie = post.headers.getSetCookie();
  log(
    5,
    `вход: ${post.status} | redirect: ${post.headers.get('location')} | cookie: ${
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

  const cookie = setCookie.map((entry) => entry.split(';')[0]).join('; ');

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
    const { html } = await fetchHtml(`/schedule/${templates[0].id}`, cookie);
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
  const draftLogin = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const draftToken = (await draftLogin.json())?.accessToken;

  const groupsForDraft = await (
    await fetch(`${base}/api/proxy/groups`, { headers: { cookie } })
  ).json();
  if (Array.isArray(groupsForDraft) && groupsForDraft.length > 0 && draftToken) {
    const draftYear = new Date().getFullYear() + 1;
    const draft = await fetch(`${apiBase}/schedule-templates`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${draftToken}`,
      },
      body: JSON.stringify({ groupId: groupsForDraft[0].id, year: draftYear, quarter: 1 }),
    });

    if (draft.ok) {
      const created = await draft.json();
      const { html } = await fetchHtml(`/schedule/${created.id}`, cookie);
      log(
        '8г',
        `черновик расписания (${draftYear} Q1): добавление слота ${html.includes(
          'Добавить слот',
        )} | кнопка публикации ${html.includes('Опубликовать расписание')}`,
      );
      // Удаляем черновик, чтобы не оставлять данные после проверки.
      await fetch(`${apiBase}/schedule-templates/${created.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${draftToken}` },
      });
    } else {
      log('8г', `черновик создать не удалось: ${draft.status}`);
    }
  }

  // 8д. Посещаемость занятия: журнал, отметки и предупреждения.
  const demoLogin = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const demoToken = (await demoLogin.json())?.accessToken;

  if (demoToken) {
    const sessions = await (
      await fetch(`${apiBase}/training-sessions`, {
        headers: { authorization: `Bearer ${demoToken}` },
      })
    ).json();

    // Нужно занятие с непустым составом: у групп, оставшихся от прошлых
    // проверок, участников может уже не быть.
    let reportable = null;
    let withAbsence = null;
    if (Array.isArray(sessions)) {
      for (const candidate of sessions.slice(0, 10)) {
        const journal = await fetch(
          `${apiBase}/training-sessions/${candidate.id}/attendance`,
          { headers: { authorization: `Bearer ${demoToken}` } },
        );
        if (!journal.ok) {
          continue;
        }
        const payload = await journal.json();
        const roster = payload.roster ?? [];
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
  const groups = await (
    await fetch(`${base}/api/proxy/groups`, { headers: { cookie } })
  ).json();
  if (Array.isArray(groups) && groups.length > 0) {
    const { html } = await fetchHtml(`/groups/${groups[0].id}`, cookie);
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
    const { html } = await fetchHtml(`/athletes/${athletes[0].id}`, cookie);
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
  const login = await (
    await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  ).json();

  const me = await (
    await fetch(`${apiBase}/me`, {
      headers: { authorization: `Bearer ${login.accessToken}` },
    })
  ).json();

  const usersCount = await (
    await fetch(`${apiBase}/users?perPage=100`, {
      headers: { authorization: `Bearer ${login.accessToken}` },
    })
  ).json();

  const { html: permissionsHtml } = await fetchHtml(`/users/${me.id}/permissions`, cookie);
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
}

main().catch((error) => {
  console.log('ERR', error.message);
  process.exitCode = 1;
});
