/**
 * Общие шаги проверок админки по HTTP.
 *
 * Вынесено в модуль, чтобы проверки экранов (`check-admin.mjs`,
 * `check-admin-finance.mjs`) не повторяли разбор формы входа: серверные действия
 * Next передают параметры скрытыми полями, и формат нужно менять в одном месте.
 *
 * Использование:
 *   import { loginCookies, fetchHtml, readHiddenFields } from './admin-check-client.mjs';
 */

export const DEFAULT_ADMIN_BASE = 'http://localhost:3001';
export const DEFAULT_API_BASE = 'http://127.0.0.1:3000/api/v1';
export const DEFAULT_EMAIL = process.env.ADMIN_EMAIL ?? 'superadmin@octagon.local';
export const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ChangeMe-Octagon-2026!';

export function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Скрытые поля первой формы страницы: их формирует server action. */
export function readHiddenFields(html) {
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

/**
 * Вход в админку и строка cookie для последующих запросов.
 *
 * `origin` обязателен: Next отклоняет server actions без заголовка origin, и без
 * него вход возвращает 500 «Failed to find Server Action». Адрес админки должен
 * совпадать с origin: dev-сервер запрещает кросс-доменные запросы действий
 * (localhost и 127.0.0.1 для Next — разные источники).
 */
export async function loginCookies(options = {}) {
  const base = options.base ?? DEFAULT_ADMIN_BASE;
  const email = options.email ?? DEFAULT_EMAIL;
  const password = options.password ?? DEFAULT_PASSWORD;

  const html = await (await fetch(`${base}/login`)).text();
  const hidden = readHiddenFields(html);
  if (!hidden || hidden.size < 2) {
    throw new Error('не найдены скрытые поля формы входа: формат server action изменился');
  }

  const form = new FormData();
  for (const [name, value] of hidden) {
    form.set(name, value);
  }
  form.set('email', email);
  form.set('password', password);

  const response = await fetch(`${base}/login`, {
    method: 'POST',
    body: form,
    redirect: 'manual',
    headers: { accept: 'text/x-component', origin: base },
  });

  const setCookie = response.headers.getSetCookie();
  return {
    status: response.status,
    location: response.headers.get('location'),
    setCookie,
    cookie: setCookie.map((entry) => entry.split(';')[0]).join('; '),
  };
}

/** Запрос страницы админки с cookie сессии. */
export async function fetchHtml(base, path, cookie) {
  const response = await fetch(`${base}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  return { status: response.status, location: response.headers.get('location'), html: await response.text() };
}

/** Вход в backend API: нужен для подготовки данных и сверки с БД. */
export async function apiLogin(apiBase, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const response = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (await response.json())?.accessToken ?? '';
}

/** Запрос к backend API от имени пользователя. */
export async function apiCall(apiBase, token, method, path, body) {
  const response = await fetch(`${apiBase}${path}`, {
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

/**
 * Разбор формы серверного действия из разметки.
 *
 * Возвращает скрытые поля действия и подписи видимых полей: отправка повторяет
 * то, что сделал бы браузер, поэтому проверка подтверждает работу формы, а не
 * только ее наличие.
 */
export function readActionForm(html, marker) {
  const index = html.indexOf(marker);
  if (index < 0) {
    return null;
  }

  const start = html.lastIndexOf('<form', index);
  const end = html.indexOf('</form>', index);
  if (start < 0 || end < 0) {
    return null;
  }

  const formHtml = html.slice(start, end);
  const fields = new Map();
  for (const match of formHtml.matchAll(
    /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g,
  )) {
    fields.set(match[1], decodeHtml(match[2] ?? ''));
  }

  return { fields, html: formHtml };
}
