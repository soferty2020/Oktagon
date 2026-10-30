import { NextResponse, type NextRequest } from 'next/server';

import { apiBaseUrl, clearTokens, readTokens, refreshAccessToken } from '@/lib/server/session';

/**
 * Прокси к backend API.
 *
 * Все запросы браузера идут сюда (`/api/proxy/...`), а сервер админки
 * подставляет access-токен из httpOnly-cookie. Так токен не оказывается в
 * JavaScript, а админке не нужен CORS на backend.
 *
 * Если access-токен истек, запрос повторяется один раз после обновления: иначе
 * пользователь видел бы ошибку каждые 15 минут.
 */
/**
 * Прокси принимает cookie-токен, поэтому небезопасные методы должны приходить
 * со своего же источника. `SameSite=Lax` защищает только от чужого сайта, но не
 * от соседнего поддомена (#51, находка S-1).
 */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) {
    // Запросы без Origin (curl, серверные вызовы) cookie не несут смысла для CSRF,
    // но браузер их и не шлёт: пропускаем, проверка ниже всё равно сверит Host.
    return true;
  }

  const host = request.headers.get('host');
  const allowed = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/$/, '');
  try {
    const originUrl = new URL(origin);
    if (host && originUrl.host === host) {
      return true;
    }
    return allowed.length > 0 && origin.replace(/\/$/, '') === allowed;
  } catch {
    return false;
  }
}

async function forward(request: NextRequest, path: string[]): Promise<NextResponse> {
  const method = request.method;
  const unsafe = method !== 'GET' && method !== 'HEAD';
  if (unsafe && !isSameOrigin(request)) {
    return NextResponse.json(
      { code: 'FORBIDDEN_ORIGIN', message: 'Запрос с другого источника отклонён.' },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const target = `${apiBaseUrl()}/${path.join('/')}${url.search}`;

  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

  const callBackend = async (accessToken?: string): Promise<Response> =>
    fetch(target, {
      method,
      headers: {
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(body && body.byteLength > 0 ? { 'content-type': 'application/json' } : {}),
      },
      ...(body && body.byteLength > 0 ? { body } : {}),
      cache: 'no-store',
    });

  let { accessToken } = await readTokens();
  let response: Response;

  try {
    response = await callBackend(accessToken);
  } catch {
    // Backend недоступен: отвечаем 503, а не 500, чтобы интерфейс мог показать
    // понятное «сервис недоступен» и не выглядел сломанным.
    return NextResponse.json(
      { code: 'SERVICE_UNAVAILABLE', message: 'Backend API недоступен. Проверьте, что он запущен.' },
      { status: 503 },
    );
  }

  if (response.status === 401 && accessToken) {
    const renewed = await refreshAccessToken();
    if (!renewed) {
      await clearTokens();
      return NextResponse.json(
        { code: 'UNAUTHENTICATED', message: 'Сессия истекла, войдите заново' },
        { status: 401 },
      );
    }

    accessToken = renewed;
    try {
      response = await callBackend(accessToken);
    } catch {
      return NextResponse.json(
        {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Backend API недоступен. Проверьте, что он запущен.',
        },
        { status: 503 },
      );
    }
  }

  // Тело пересылаем как есть: контракт API уже описывает формат ошибок.
  const payload = await response.text();
  return new NextResponse(payload, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
    },
  });
}

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path);
}
