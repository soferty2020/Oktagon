import type { ApiErrorBody, ApiErrorCode } from '@octagon/contracts';
import { API_ERROR_HTTP_STATUS } from '@octagon/contracts';

/**
 * Доменная ошибка API с машиночитаемым кодом (docs/09-api.md).
 * HTTP-статус выводится из кода через API_ERROR_HTTP_STATUS.
 */
export class ApiException extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiException';
    this.code = code;
    this.status = API_ERROR_HTTP_STATUS[code] ?? 500;
    this.details = details;
    Error.captureStackTrace?.(this, ApiException);
  }

  toBody(requestId?: string): ApiErrorBody {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
      ...(requestId ? { requestId } : {}),
    };
  }

  static notFound(message: string, details?: Record<string, unknown>): ApiException {
    return new ApiException('NOT_FOUND', message, details);
  }

  static forbidden(message = 'Access denied'): ApiException {
    return new ApiException('FORBIDDEN', message);
  }

  static conflict(code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
    return new ApiException(code, message, details);
  }
}
