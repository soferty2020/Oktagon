/**
 * Разовая проверка админки по HTTP.
 *
 * Проверяет то, что нельзя подтвердить типами: страница входа отдается без
 * сессии, защищенные страницы перенаправляют на вход, вход через server action
 * устанавливает httpOnly-cookie, а прокси отдает данные backend от имени
 * пользователя.
 *
 * Скрытые поля формы (в том числе $ACTION_KEY) разбираются из HTML: в
 * проде это делает браузер, а в проверке — скрипт, поэтому формат не
 * дублируется вручную.
 *
 * Использование: node .tools/check-admin.mjs [baseUrl]
 */
const base = process.argv[2] ?? 'http://127.0.0.1:3001';
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
  for (const match of form.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g)) {
    fields.set(match[1], decodeHtml(match[2] ?? ''));
  }
  return fields;
}

async function main() {
  // 1. Страница входа доступна без сессии.
  const loginPage = await fetch(`${base}/login`);
  const loginHtml = await loginPage.text();
  log(
    1,
    `/login: ${loginPage.status} | форма входа отрисована: ${loginHtml.includes('name="email"')}`,
  );

  // 2. Защищенная страница без cookie отправляет на вход.
  const root = await fetch(`${base}/`, { redirect: 'manual' });
  log(2, `/ без сессии: ${root.status} | redirect: ${root.headers.get('location')}`);

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

  const cookieHeader = setCookie.map((cookie) => cookie.split(';')[0]).join('; ');

  // 7. Защищенная страница с cookie отдается и показывает права пользователя.
  const dashboard = await fetch(`${base}/`, { headers: { cookie: cookieHeader } });
  const dashboardHtml = await dashboard.text();
  log(
    7,
    `/ с сессией: ${dashboard.status} | права пользователя: ${dashboardHtml.includes(
      'Права пользователя',
    )}`,
  );

  // 8. Справочник филиалов отрисован на сервере.
  const branches = await fetch(`${base}/branches`, { headers: { cookie: cookieHeader } });
  const branchesHtml = await branches.text();
  log(
    8,
    `/branches: ${branches.status} | форма создания: ${branchesHtml.includes('Новый филиал')}`,
  );

  // 9. Прокси отдает данные backend от имени пользователя.
  const viaProxy = await fetch(`${base}/api/proxy/branches`, {
    headers: { cookie: cookieHeader },
  });
  const proxyBody = await viaProxy.text();
  log(9, `/api/proxy/branches: ${viaProxy.status} | тело: ${proxyBody.slice(0, 90)}`);

  // 10. Спортсмены и группы: страницы отдают данные.
  const [athletes, groups] = await Promise.all([
    fetch(`${base}/athletes`, { headers: { cookie: cookieHeader } }),
    fetch(`${base}/groups`, { headers: { cookie: cookieHeader } }),
  ]);
  const athletesHtml = await athletes.text();
  const groupsHtml = await groups.text();
  log(
    10,
    `/athletes: ${athletes.status} (таблица: ${athletesHtml.includes('Дата рождения')}) | /groups: ${
      groups.status
    } (таблица: ${groupsHtml.includes('Основной филиал')})`,
  );
}

main().catch((error) => {
  console.log('ERR', error.message);
  process.exitCode = 1;
});
