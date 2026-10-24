import { NextResponse } from 'next/server';

import { apiBaseUrl } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

/**
 * Скачивание CSV с авторизацией.
 *
 * Браузер не передаст httpOnly-cookie в обычный fetch из компонента, поэтому
 * выгрузка идет через серверный роут админки: он читает сессию и проксирует файл
 * из API. Прямая ссылка на API потребовала бы токен в URL — это утечка.
 */
async function proxyCsv(path: string, fallbackName: string): Promise<Response> {
  const user = await getCurrentUser();
  const { accessToken } = await readTokens();

  if (!user || !accessToken) {
    return NextResponse.json({ message: 'Сессия истекла' }, { status: 401 });
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    return NextResponse.json({ message: 'Не удалось выгрузить файл' }, { status: response.status });
  }

  const content = await response.text();
  const disposition =
    response.headers.get('content-disposition') ?? `attachment; filename="${fallbackName}"`;

  return new Response(content, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': disposition,
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const kind = url.pathname.split('/').at(-1);

  if (kind === 'debts') {
    const year = url.searchParams.get('year') ?? String(new Date().getFullYear());
    const month = url.searchParams.get('month') ?? String(new Date().getMonth() + 1);
    return proxyCsv(`/debts/export?year=${year}&month=${month}`, `debtors-${year}-${month}.csv`);
  }

  if (kind === 'payments') {
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    if (!from || !to) {
      return NextResponse.json({ message: 'Нужны from и to' }, { status: 400 });
    }
    return proxyCsv(
      `/finance/payments/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      `payments-${from}-${to}.csv`,
    );
  }

  return NextResponse.json({ message: 'Неизвестный тип выгрузки' }, { status: 404 });
}
