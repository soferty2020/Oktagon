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
