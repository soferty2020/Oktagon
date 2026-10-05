/**
 * Транспортные примитивы API: пагинация на коллекциях и корректная работа с
 * календарными периодами (docs/23-api-contract-plan.md, docs/08-database.md).
 */

/** Ответ-обёртка для коллекций. */
export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Query-параметры пагинации. */
export interface PageQuery {
  page?: number;
  perPage?: number;
}

/**
 * Календарный расчётный период. Хранится отдельными year/month и никогда не
 * выводится из UTC-timestamps (docs/08-database.md).
 */
export interface CalendarPeriod {
  year: number;
  month: number;
}

export function isCalendarPeriod(value: unknown): value is CalendarPeriod {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<CalendarPeriod>;
  return (
    Number.isInteger(candidate.year) &&
    Number.isInteger(candidate.month) &&
    (candidate.month as number) >= 1 &&
    (candidate.month as number) <= 12
  );
}

/** /api/v1 — versioned prefix (docs/09-api.md). */
export const API_PREFIX = 'api/v1';
