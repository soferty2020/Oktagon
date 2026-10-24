/**
 * Общие помощники финансовых экранов.
 *
 * Здесь только чистые функции и подписи: файл импортируют и серверные
 * компоненты, и клиентские формы. Server actions лежат в `actions.ts`.
 */

/** Состояние любой финансовой формы: либо ошибка, либо подтверждение. */
export interface FinanceFormState {
  error?: string;
  success?: string;
}

/**
 * Ключ идемпотентности для оплаты.
 *
 * Форма генерирует его один раз при отрисовке и отправляет вместе с суммой:
 * повторная отправка той же формы вернет текущее состояние периода, а не
 * создаст вторую оплату. Иначе двойной клик по кнопке удвоил бы поступление.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `payment-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export const CURRENT_YEAR = new Date().getFullYear();

/** Год и месяц в границах контракта: `PeriodQueryDto` принимает 2020..2100. */
export function parseYearMonth(
  params: { year?: string; month?: string },
  fallback: { year: number; month: number },
): { year: number; month: number } {
  const year = Number(params.year);
  const month = Number(params.month);

  return {
    year: Number.isInteger(year) && year >= 2020 && year <= 2100 ? year : fallback.year,
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : fallback.month,
  };
}

/** Строка поискового запроса с выбранным месяцем. */
export function monthQuery(year: number, month: number): string {
  return `year=${year}&month=${month}`;
}

/** Способ оплаты: значения фиксированы контрактом, подписи — для человека. */
export function paymentMethodLabel(method: string): string {
  switch (method) {
    case 'CASH':
      return 'наличные';
    case 'CARD':
      return 'карта';
    case 'TRANSFER':
      return 'перевод';
    case 'OTHER':
      return 'другое';
    default:
      return method;
  }
}

/**
 * Причина, по которой спортсмен не считается должником (BR-004).
 *
 * Показывается явно: руководителю важно отличать решение клуба (заморозка,
 * ручная отметка) от отсутствия данных, а не видеть просто «не должник».
 */
export function debtorExemptionLabel(reason: string | null): string {
  switch (reason) {
    case 'INACTIVE':
      return 'не активен';
    case 'MARKED_FULLY_PAID':
      return 'отмечен оплаченным';
    case 'NO_TRAININGS_YET':
      return 'в месяце не было занятий';
    case 'FROZEN':
      return 'в заморозке';
    case null:
      return 'должен';
    default:
      return reason;
  }
}

export interface ParsedAmount {
  value: number | null;
  error?: string;
}

/**
 * Разбор суммы из формы.
 *
 * Запятая как разделитель дробной части принимается: администратор вводит сумму
 * так, как привык, и отказ «неверный формат» на «25000,50» был бы необъяснимым.
 */
export function parseAmount(raw: string, options: { required?: boolean } = {}): ParsedAmount {
  const trimmed = raw.trim().replace(/\s/g, '');
  if (trimmed === '') {
    return options.required ? { value: null, error: 'Укажите сумму' } : { value: null };
  }

  const normalized = trimmed.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return { value: null, error: 'Сумма должна быть числом' };
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return { value: null, error: 'Сумма должна быть числом' };
  }
  if (options.required && !(value > 0)) {
    return { value: null, error: 'Сумма должна быть больше нуля' };
  }
  if (value < 0) {
    return { value: null, error: 'Сумма не может быть отрицательной' };
  }

  return { value };
}

/**
 * Дата YYYY-MM-DD из формы.
 *
 * `paidAt` и даты заморозки — календарные дни без времени: контракт принимает
 * строку, и подстановка «сегодня» по времени сервера здесь не нужна.
 */
export function parseCalendarDate(raw: string): { value: string | null; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { value: null };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { value: null, error: 'Дата должна быть в формате ГГГГ-ММ-ДД' };
  }
  return { value: trimmed };
}

/** Начало месяца в ISO-формате: для выгрузки движений. */
export function isoMonthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** Начало следующего месяца в ISO: период выгрузки `[from, to)`. */
export function isoMonthEnd(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}