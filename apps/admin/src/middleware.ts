import { NextResponse, type NextRequest } from 'next/server';

/**
 * Продление сессии до рендера страницы.
 *
 * Access-токен живёт 15 минут. Без этого middleware страница после истечения
 * токена показывала экран входа, хотя refresh-cookie ещё действовала: серверный
 * `getCurrentUser()` читает cookie, а записать обновлённую из Server Component
 * нельзя. Middleware правит cookie до рендера — единственное место, где это
 * безопасно.
 *
 * Если backend недоступен, запрос пропускается без изменений: временный сбой
 * API не должен разлогинивать.
 */

const ACCESS_COOKIE = 'octagon_access';
const REFRESH_COOKIE = 'octagon_refresh';
const ACCESS_MAX_AGE_SECONDS = 900;
const REFRESH_MAX_AGE_SECONDS = 1_209_600;

function apiBaseUrl(): string {
  return process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1';
}

/** Истёк ли JWT. Подпись здесь не проверяется: решение только о продлении. */
function isExpired(token: string): boolean {
  const payload = token.split('.')[1];
  if (!payload) {
    return true;
  }
  try {
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { exp?: number };
    if (typeof json.exp !== 'number') {
      return true;
    }
    // Небольшой запас: токен, который истечёт через секунду, бесполезен.
    return json.exp * 1000 <= Date.now() + 5_000;
  } catch {
    return true;
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!refresh || (access && !isExpired(access))) {
    return NextResponse.next();
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
      cache: 'no-store',
    });
  } catch {
    // Backend недоступен — не трогаем cookie.
    return NextResponse.next();
  }

  if (!response.ok) {
    // 5xx — сбой сервера, сессия может быть жива: cookie оставляем.
    if (response.status >= 500) {
      return NextResponse.next();
    }
    const cleared = NextResponse.next();
    cleared.cookies.delete(ACCESS_COOKIE);
    cleared.cookies.delete(REFRESH_COOKIE);
    return cleared;
  }

  const session = (await response.json()) as {
    accessToken?: string;
    refreshToken?: string;
  };
  if (!session.accessToken || !session.refreshToken) {
    return NextResponse.next();
  }

  const next = NextResponse.next();
  const secure = process.env.NODE_ENV === 'production';
  next.cookies.set(ACCESS_COOKIE, session.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: ACCESS_MAX_AGE_SECONDS,
  });
  next.cookies.set(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: REFRESH_MAX_AGE_SECONDS,
  });
  return next;
}

export const config = {
  // Прокси и статика продлеваются сами: прокси — Route Handler, статике
  // сессия не нужна.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
