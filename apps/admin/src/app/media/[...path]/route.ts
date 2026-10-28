import { apiBaseUrl } from '@/lib/api/client';

/**
 * Прокси изображений новостей (#70).
 *
 * Файлы лежат в API (`/media/...`), но браузер админки не знает внутренний адрес
 * `http://api:3000`: он резолвится только внутри сети контейнеров. Запрос идёт
 * через админку и получает тот же путь, что и страница.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const target = `${apiBaseUrl().replace(/\/api\/v1$/, '')}/media/${path.join('/')}`;

  const response = await fetch(target, { cache: 'no-store' });

  if (!response.ok) {
    return new Response('Изображение не найдено', { status: response.status });
  }

  return new Response(response.body, {
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
      // Файлы неизменяемы: имя — UUID, содержимое по нему не меняется.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
