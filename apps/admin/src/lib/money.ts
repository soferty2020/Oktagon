/**
 * Форматирование денег и дат для финансовых экранов.
 *
 * Своя функция, а не `Intl.NumberFormat`: суммы приходят числами, а разделитель
 * разрядов и отсутствие копеек у целых сумм нужны одинаковые на сервере и в
 * браузере. Локаль окружения в разных местах разная, поэтому формат задан явно.
 */

/** Сумма с разделителем разрядов: 25000 → «25 000». */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }

  const rounded = Math.round(value * 100) / 100;
  const [whole, fraction] = Math.abs(rounded).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sign = rounded < 0 ? '−' : '';

  // Копейки показываем только когда они есть: «25 000» читается легче, чем
  // «25 000,00», а дробные суммы в клубе все же встречаются.
  return fraction === '00' ? `${sign}${grouped}` : `${sign}${grouped},${fraction}`;
}

/** Сумма с подписью единицы: «25 000 ₸». Валюта в MVP одна и не настраивается. */
export function formatAmount(value: number | null | undefined): string {
  const formatted = formatMoney(value);
  return formatted === '—' ? formatted : `${formatted} ₸`;
}

export const MONTH_NAMES: readonly string[] = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

/** «октябрь 2026». */
export function formatMonth(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`;
}

/** Календарная дата YYYY-MM-DD в привычном виде: 2026-10-05 → «05.10.2026». */
export function formatCalendarDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) {
    return value;
  }
  return `${day}.${month}.${year}`;
}

/** Момент UTC в виде «05.10.2026 18:30»: значения приходят в UTC. */
export function formatMoment(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
