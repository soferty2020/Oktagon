/**
 * Статус оплаты глазами участника (B: финансы родителя в мобильном).
 *
 * Суммы наружу не отдаются: BR-010 закрывает финансы для MEMBER, и решение
 * продукта — показывать только факт, а не деньги. Родителю нужен ответ «я все
 * сделал или нет», а не «сколько осталось»: второе порождает споры и требует
 * объяснений.
 */

/** Что видит участник. */
export const AthletePaymentStatus = {
  /** Оплачено: остатка нет или он в пределах допуска. */
  PAID: 'PAID',
  /** Внесено частично: деньги были, но остаток больше допуска. */
  PARTIAL: 'PARTIAL',
  /** Ничего не внесено. */
  NOT_PAID: 'NOT_PAID',
  /** За месяц платить не нужно: заморозка, отметка об оплате или нет занятий. */
  NOT_REQUIRED: 'NOT_REQUIRED',
  /**
   * Ожидаемая сумма не задана — клуб еще не решил, сколько брать.
   *
   * Показывается как «уточните у администратора»: родитель не должен читать
   * «должен», когда сумма еще не определена.
   */
  UNKNOWN: 'UNKNOWN',
} as const;
export type AthletePaymentStatus =
  (typeof AthletePaymentStatus)[keyof typeof AthletePaymentStatus];

/** Ответ `GET /me/athletes/{id}/payment-status`. */
export interface AthletePaymentStatusView {
  athleteId: string;
  year: number;
  /** 1..12 */
  month: number;
  /** Подпись месяца: «октябрь 2026». */
  monthLabel: string;
  status: AthletePaymentStatus;
  /** Текст для интерфейса; сервер не навязывает формулировку, но подсказывает. */
  message: string;
}

const MONTH_NAMES = [
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

/** Подпись месяца для интерфейса. */
export function paymentMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`;
}

/** Текст статуса: одна формулировка на все клиенты. */
export function paymentStatusMessage(status: AthletePaymentStatus, year: number, month: number): string {
  const label = paymentMonthLabel(year, month);

  switch (status) {
    case AthletePaymentStatus.PAID:
      return `Оплата за ${label} внесена`;
    case AthletePaymentStatus.PARTIAL:
      return `Оплата за ${label} внесена частично`;
    case AthletePaymentStatus.NOT_PAID:
      return `Оплата за ${label} не внесена`;
    case AthletePaymentStatus.NOT_REQUIRED:
      return `Оплата за ${label} не требуется`;
    case AthletePaymentStatus.UNKNOWN:
      return `Оплата за ${label}: уточните у администратора`;
  }
}
