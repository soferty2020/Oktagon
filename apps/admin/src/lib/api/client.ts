import type { paths } from './schema';

/**
 * Типизированный доступ к backend API из серверных компонентов и действий.
 *
 * Браузер обращается к `/api/proxy/...`, но серверные компоненты могут ходить
 * напрямую в backend по тому же контракту: типы взяты из `openapi.yaml`
 * (`pnpm api:types`), поэтому расхождение с контрактом видно на компиляции.
 */
export type ApiPaths = paths;

export interface ApiFailure {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

export function apiBaseUrl(): string {
  return process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1';
}

/** Выполняет запрос к API и приводит ошибки к единому виду (docs/09-api.md). */
export async function apiFetch<T>(
  path: string,
  options: { accessToken?: string; method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      cache: 'no-store',
    });
  } catch {
    // Сетевой сбой — такой же результат, как ошибка API: страницы ждут
    // ApiResult и умеют показать `error`, а исключение давало 500 вместо
    // понятного «сервис недоступен».
    return {
      ok: false,
      error: {
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Backend API недоступен. Проверьте подключение или повторите позже.',
      },
    };
  }

  if (response.status === 204) {
    return { ok: true, data: undefined as T };
  }

  const payload = (await response.json().catch(() => null)) as
    (T & { code?: string; message?: string; details?: Record<string, unknown> }) | null;

  if (!response.ok) {
    return {
      ok: false,
      error: {
        status: response.status,
        code: payload?.code ?? 'INTERNAL_ERROR',
        message: payload?.message ?? 'Не удалось выполнить запрос',
        ...(payload?.details ? { details: payload.details } : {}),
      },
    };
  }

  return { ok: true, data: payload as T };
}

/** Понятное описание ошибки для интерфейса. */
export function describeError(error: ApiFailure): string {
  switch (error.code) {
    case 'FORBIDDEN':
      return 'Недостаточно прав для этого действия';
    case 'UNAUTHENTICATED':
      return 'Сессия истекла, войдите заново';
    case 'BRANCH_ARCHIVED':
      return 'Филиал неактивен: сначала включите его';
    case 'EMAIL_ALREADY_EXISTS':
      return 'Пользователь с таким email уже существует';
    case 'HALL_NAME_TAKEN':
      return 'В этом филиале уже есть зал с таким названием';
    case 'HALL_HAS_SESSIONS':
      return 'В зале есть предстоящие занятия: сначала перенесите их в другой зал';
    case 'SERVICE_UNAVAILABLE':
      return 'Сервис недоступен. Проверьте подключение или повторите позже';
    default:
      return error.message;
  }
}
