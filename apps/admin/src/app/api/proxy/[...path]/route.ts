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
async function forward(request: NextRequest, path: string[]): Promise<NextResponse> {
  const url = new URL(request.url);
  const target = `${apiBaseUrl()}/${path.join('/')}${url.search}`;

  const method = request.method;
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

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
  let response = await callBackend(accessToken);

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
    response = await callBackend(accessToken);
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
