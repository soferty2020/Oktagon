/**
 * Контракт финансов (эпик F).
 *
 * Спецификация: BR-001 (оплата учитывается по календарным месяцам),
 * BR-002 (сумма вводится вручную, для нового спортсмена она может быть любой),
 * BR-003 (месяц можно вручную отметить оплаченным полностью),
 * BR-004 (задолженность по четырем условиям), BR-005 (заморозка — открытый
 * период), BR-010 (финансы доступны только с явным правом).
 *
 * Доступ: все эндпоинты требуют `payments.view` / `payments.edit` или
 * `freezes.view` / `freezes.edit`. Ни одна роль, кроме суперадмина, этих прав не
 * имеет: тренер не видит финансы (docs/04-roles-permissions.md, BR-010).
 */

import type { MembershipPeriodStatus, PaymentMethod } from './domain';

/** Способ оплаты, зафиксированный вручную. */
export type { PaymentMethod };

/** Статус расчетного периода (BR-001..BR-003). */
export type { MembershipPeriodStatus };

/** Оплата в периоде. */
export interface PaymentView {
  id: string;
  amount: number;
  method: PaymentMethod;
  /** Календарная дата оплаты, YYYY-MM-DD. */
  paidAt: string;
  comment: string | null;
  createdById: string | null;
  createdAt: string;
}

/** Расчетный период за календарный месяц. */
export interface MembershipPeriodView {
  id: string;
  athleteId: string;
  year: number;
  /** 1..12 */
  month: number;
  /** Сколько ожидается к оплате; может быть не задано (BR-002). */
  expectedAmount: number | null;
  paidAmount: number;
  status: MembershipPeriodStatus;
  /** Ручная отметка «оплачен полностью» (BR-003). */
  fullyPaidMarkedAt: string | null;
  fullyPaidMarkedById: string | null;
  note: string | null;
  payments: PaymentView[];
}

/** Сводка по месяцу для списка должников. */
export interface DebtorSummary {
  athleteId: string;
  firstName: string;
  lastName: string;
  year: number;
  month: number;
  paidAmount: number;
  expectedAmount: number | null;
  /** Задолженность по BR-004 (все четыре условия выполнены). */
  isDebtor: boolean;
  /** Почему не должник: для интерфейса полезнее причины, чем флаг. */
  reason: DebtorExemption | null;
}

/**
 * Причина, по которой спортсмен не считается должником.
 *
 * Возвращается явно: руководителю важно видеть, что «не должник» — это решение
 * (заморозка, отметка об оплате), а не отсутствие данных.
 */
export const DebtorExemption = {
  /** Спортсмен не активен (архивирован или заморожен по статусу карточки). */
  INACTIVE: 'INACTIVE',
  /** Месяц отмечен как оплаченный полностью (BR-003). */
  MARKED_FULLY_PAID: 'MARKED_FULLY_PAID',
  /** В месяце еще не было ни одной тренировки группы (BR-004, условие 3). */
  NO_TRAININGS_YET: 'NO_TRAININGS_YET',
  /** Спортсмен в заморозке на соответствующую дату (BR-004, условие 4). */
  FROZEN: 'FROZEN',
} as const;
export type DebtorExemption = (typeof DebtorExemption)[keyof typeof DebtorExemption];

export interface UpdateMembershipPeriodInput {
  /** Ожидаемая сумма; null снимает ожидание. */
  expectedAmount?: number | null;
  note?: string | null;
}

export interface RecordPaymentInput {
  /** Произвольная сумма (BR-002). */
  amount: number;
  method?: PaymentMethod;
  /** Календарная дата оплаты; по умолчанию сегодня. */
  paidAt?: string;
  comment?: string | null;
  /**
   * Ключ идемпотентности: повторная отправка той же оплаты не создаст вторую
   * запись (docs/23-api-contract-plan.md).
   */
  idempotencyKey?: string;
}

export interface UpdatePaymentInput {
  amount?: number;
  method?: PaymentMethod;
  paidAt?: string;
  comment?: string | null;
}

/** Заморозка: открытый период приостановления (BR-005). */
export interface FreezeView {
  id: string;
  athleteId: string;
  athleteName: string;
  /** Календарная дата начала, YYYY-MM-DD. */
  startedOn: string;
  /** Календарная дата завершения; null — заморозка открыта. */
  endedOn: string | null;
  reason: string | null;
  isOpen: boolean;
  createdAt: string;
}

export interface CreateFreezeInput {
  /** Дату можно указать задним числом (BR-005). */
  startedOn: string;
  reason?: string | null;
}

export interface CloseFreezeInput {
  /** Дату завершения тоже можно указать задним числом (BR-005). */
  endedOn: string;
}
