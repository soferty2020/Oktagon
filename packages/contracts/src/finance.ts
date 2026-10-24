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

import type { MembershipPeriodStatus, PaymentKind, PaymentMethod } from './domain';

/** Способ оплаты, зафиксированный вручную. */
export type { PaymentMethod };

/** Направление движения средств: поступление или возврат (ADR-0010). */
export type { PaymentKind };

/** Статус расчетного периода (BR-001..BR-003). */
export type { MembershipPeriodStatus };

/**
 * Транзакция по расчетному периоду: поступление или возврат (ADR-0010).
 *
 * Сумма всегда положительна, направление задает `kind`. Оба движения живут в
 * одной ленте, потому что история периода читается подряд: «внес 25 000, вернул
 * 10 000» — это две записи одного списка.
 */
export interface PaymentView {
  id: string;
  kind: PaymentKind;
  amount: number;
  method: PaymentMethod;
  /** Календарная дата движения, YYYY-MM-DD. */
  paidAt: string;
  comment: string | null;
  /**
   * Поступление, к которому привязан возврат (только для `kind = REFUND`).
   * null — корректировка периода без привязки к конкретному поступлению.
   */
  refundedPaymentId: string | null;
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
  /**
   * Зачтено: поступления минус возвраты (ADR-0010).
   *
   * Именно эта сумма участвует в статусе периода и в задолженности:
   * возвращенные деньги не считаются оплатой, иначе долг был бы завышен.
   */
  paidAmount: number;
  /** Сколько всего возвращено по периоду (ADR-0010). */
  refundedAmount: number;
  status: MembershipPeriodStatus;
  /** Ручная отметка «оплачен полностью» (BR-003). */
  fullyPaidMarkedAt: string | null;
  fullyPaidMarkedById: string | null;
  note: string | null;
  /** Лента движений периода: поступления и возвраты (ADR-0010). */
  payments: PaymentView[];
}

/** Сводка по месяцу для списка должников. */
export interface DebtorSummary {
  athleteId: string;
  firstName: string;
  lastName: string;
  year: number;
  month: number;
  /** Зачтено: поступления минус возвраты (ADR-0010). */
  paidAmount: number;
  /** Сколько возвращено по периоду (ADR-0010). */
  refundedAmount: number;
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

/**
 * Денежные итоги: сколько получено за период, сколько вернули и что осталось.
 *
 * Выручка считается **по датам движений**: это отчет о фактическом движении
 * денег за календарный месяц, а не о начислениях. Поэтому оплата, внесенная в
 * октябре за сентябрь, попадает в октябрьскую выручку. Задолженность, наоборот,
 * относится к расчетному месяцу: долг за сентябрь остается сентябрьским, даже
 * если его закрыли в октябре.
 */
export interface FinanceTotals {
  /** Поступления за период. */
  received: number;
  /** Возвраты за период. */
  refunded: number;
  /** Выручка: поступления минус возвраты (ADR-0010). */
  revenue: number;
}

/** Денежные итоги по филиалу: позволяют сравнить филиалы между собой. */
export interface BranchFinanceSummary extends FinanceTotals {
  /**
   * Основной филиал группы спортсмена. `null` — филиал не назначен: такие
   * суммы сведены в отдельную строку, потому что приписать их первому филиалу
   * значило бы показать руководителю чужие деньги как свои.
   */
  branchId: string | null;
  branchName: string;
  /** Должников среди спортсменов этого филиала. */
  debtors: number;
  /** Сколько недостает по ожидаемым суммам. */
  debt: number;
}

/** Сводка финансов за месяц: основа dashboard руководителя (F8). */
export interface FinanceSummary {
  year: number;
  /** 1..12 */
  month: number;
  /** Движения за месяц: поступления и возвраты. */
  totals: FinanceTotals;
  /** Ожидается к оплате по расчетному месяцу (сумма заданных ожиданий). */
  expected: number;
  debtors: number;
  /**
   * Должники без заданной ожидаемой суммы.
   *
   * Показывается отдельно: такому спортсмену нельзя посчитать долг, и «нет
   * долга» здесь означает не оплату, а незаполненное ожидание.
   */
  debtorsWithoutExpected: number;
  /** Недостает по ожидаемым суммам у должников. */
  debt: number;
  /** Активных спортсменов клуба. */
  activeAthletes: number;
  /** Разбивка по филиалам: выручка, возвраты и задолженность. */
  branches: BranchFinanceSummary[];
}

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

/**
 * Возврат денег по расчетному периоду (ADR-0010).
 *
 * Возврат — отдельное движение средств: сумма всегда положительна, а зачтенная
 * сумма периода уменьшается. Привязка к поступлению необязательна, но если она
 * есть, проверяется, что возвратов по этому поступлению не больше его суммы.
 */
export interface RefundPaymentInput {
  amount: number;
  /** Календарная дата возврата; по умолчанию сегодня. */
  refundedAt?: string;
  /** Причина возврата: руководителю нужен повод, а не только сумма. */
  reason?: string | null;
  /** Поступление, к которому относится возврат (ADR-0010). */
  paymentId?: string | null;
  method?: PaymentMethod;
  idempotencyKey?: string;
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

/**
 * Точка динамики за месяц (C: отчёты клуба).
 *
 * Выручка считается по датам движений, задолженность — по расчётному месяцу:
 * это разные вопросы («сколько денег прошло» и «сколько должны»), и сводить их в
 * одно число значило бы смешивать факт и ожидание.
 */
export interface FinanceDynamicsPoint {
  year: number;
  /** 1..12 */
  month: number;
  received: number;
  refunded: number;
  revenue: number;
  debtors: number;
  /** Должники без заданной ожидаемой суммы: долг по ним не считается. */
  debtorsWithoutExpected: number;
  /** Недостает по ожидаемым суммам; `null`, если есть должники без ожидания. */
  debt: number | null;
}

/** Динамика за несколько месяцев: от старых к новым. */
export interface FinanceDynamics {
  points: FinanceDynamicsPoint[];
}