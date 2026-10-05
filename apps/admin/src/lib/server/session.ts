import { cookies } from 'next/headers';

/**
 * Сессия админки.
 *
 * Токены хранятся в httpOnly-cookie и не доступны JavaScript страницы: браузер
 * обращается к backend только через прокси-маршрут админки
 * (`/api/proxy/...`). Это снимает CORS и убирает риск кражи токена XSS-скриптом
 * (docs/15-security.md).
 */

const ACCESS_COOKIE = 'octagon_access';
const REFRESH_COOKIE = 'octagon_refresh';

/** Время жизни access-токена: совпадает с JWT_ACCESS_TTL_SECONDS по умолчанию. */
const ACCESS_MAX_AGE_SECONDS = 900;
/** Время жизни refresh-токена: совпадает с JWT_REFRESH_TTL_SECONDS. */
const REFRESH_MAX_AGE_SECONDS = 1_209_600;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export function apiBaseUrl(): string {
  return process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1';
}

export async function readTokens(): Promise<Partial<AuthTokens>> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  return {
    ...(accessToken ? { accessToken } : {}),
    ...(refreshToken ? { refreshToken } : {}),
  };
}

export async function saveTokens(tokens: AuthTokens): Promise<void> {
  const store = await cookies();
  const secure = process.env.NODE_ENV === 'production';

  store.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: ACCESS_MAX_AGE_SECONDS,
  });
  // Refresh-cookie живет дольше access-токена: иначе сессию нельзя продлить,
  // когда access истек.
  store.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: REFRESH_MAX_AGE_SECONDS,
  });
}

export async function clearTokens(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

/** Обновляет access-токен и возвращает его; при неудаче очищает сессию. */
export async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = await readTokens();
  if (!refreshToken) {
    return null;
  }

  const response = await fetch(`${apiBaseUrl()}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });

  if (!response.ok) {
    // Refresh-токен истек или отозван: продлевать нечего, сессия завершена.
    await clearTokens();
    return null;
  }

  const session = (await response.json()) as Partial<AuthTokens>;
  if (!session.accessToken || !session.refreshToken) {
    await clearTokens();
    return null;
  }

  await saveTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken });
  return session.accessToken;
}

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  permissions: string[];
}

/** Профиль текущего пользователя либо null, если сессии нет. */
export async function fetchCurrentUser(accessToken: string): Promise<CurrentUser | null> {
  const response = await fetch(`${apiBaseUrl()}/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  const profile = (await response.json()) as {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    permissions?: { codes?: string[] };
  };

  return {
    id: profile.id,
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    role: profile.role,
    permissions: profile.permissions?.codes ?? [],
  };
}

/**
 * Текущий пользователь для серверных страниц.
 *
 * Если access-токен истек, но есть действующий refresh-токен, сессия молча
 * продлевается: админка — обычный web-клиент, и разлогинивать пользователя
 * каждые 15 минут недопустимо.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const { accessToken } = await readTokens();
  if (!accessToken) {
    return null;
  }

  const user = await fetchCurrentUser(accessToken);
  if (user) {
    return user;
  }

  const renewed = await refreshAccessToken();
  if (!renewed) {
    return null;
  }
  return fetchCurrentUser(renewed);
}

/** Права текущего пользователя: используются для скрытия разделов в навигации. */
export async function hasPermission(user: CurrentUser | null, code: string): Promise<boolean> {
  return user?.permissions.includes(code) ?? false;
}
