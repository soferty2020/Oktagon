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
export declare const DEFAULT_PAGE_SIZE = 25;
export declare const MAX_PAGE_SIZE = 100;
export interface PageQuery {
    page?: number;
    perPage?: number;
}
export interface CalendarPeriod {
    year: number;
    month: number;
}
export declare function isCalendarPeriod(value: unknown): value is CalendarPeriod;
export declare const API_PREFIX = "api/v1";
