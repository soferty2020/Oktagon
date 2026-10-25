import {
  DebtExpectedMissing,
  DebtFreezePolicy,
  type DebtRulesConfig,
} from '@octagon/contracts';

/** Почему спортсмен не считается должником. */
export const DebtReason = {
  MARKED_FULLY_PAID: 'MARKED_FULLY_PAID',
  FROZEN: 'FROZEN',
  NO_TRAININGS_YET: 'NO_TRAININGS_YET',
} as const;
export type DebtReason = (typeof DebtReason)[keyof typeof DebtReason];

/** Факты по спортсмену за расчетный месяц: данные, а не правила. */
export interface DebtFacts {
  athleteId: string;
  firstName: string;
  lastName: string;
  /** Месяц отмечен как полностью оплаченный (BR-003). */
  fullyPaidMarked: boolean;
  /** Заморозка действует в этом месяце (BR-005). */
  frozen: boolean;
  /** В месяце была хотя бы одна тренировка группы спортсмена. */
  hasTrainings: boolean;
  /** Ожидаемая сумма; `null`, если администратор ее не задал (BR-002). */
  expectedAmount: number | null;
  /** Зачтено: поступления минус возвраты (ADR-0010). */
  paidAmount: number;
}

/** Решение по одному спортсмену. */
export interface DebtDecision {
  isDebtor: boolean;
  /** Остаток; `null`, если ожидаемая сумма не задана. */
  outstanding: number | null;
  reason: DebtReason | null;
}

/**
 * Определяет, является ли спортсмен должником (K5, ADR-0014).
 *
 * Чистая функция без обращения к БД: именно она проверяется матрицей граничных
 * тестов, и именно ее результат должен совпадать у списка должников и preview.
 *
 * Правило (по порядку):
 * 1. отметка «полностью оплачен» — если она учитывается конфигурацией;
 * 2. заморозка — если политика освобождает месяц;
 * 3. отсутствие тренировок — если политика освобождает;
 * 4. остаток: `expected − paid`. Незаданная сумма трактуется по настройке;
 * 5. остаток должен превышать допуск. Ровно на границе — **не** должник
 *    (сравнение строгое), иначе допуск 10 000 при недоплате 10 000 давал бы
 *    должника, что противоречит смыслу «прощаем до 10 тысяч».
 */
export function evaluateDebt(config: DebtRulesConfig, facts: DebtFacts): DebtDecision {
  const reason = findExemption(config, facts);
  const outstanding =
    facts.expectedAmount === null ? null : roundMoney(facts.expectedAmount - facts.paidAmount);

  if (reason !== null) {
    return { isDebtor: false, outstanding, reason };
  }

  if (outstanding === null) {
    // Суммы нет: клуб еще не решил, сколько брать. По умолчанию такой спортсмен
    // требует внимания и попадает в список.
    return {
      isDebtor: config.expectedMissing === DebtExpectedMissing.DEBTOR,
      outstanding: null,
      reason: null,
    };
  }

  const tolerance = resolveTolerance(config, facts.expectedAmount ?? 0);
  return { isDebtor: outstanding > tolerance, outstanding, reason: null };
}

/** Основание не считать должником; `null`, если оснований нет. */
function findExemption(config: DebtRulesConfig, facts: DebtFacts): DebtReason | null {
  if (facts.fullyPaidMarked && config.useFullyPaidMark) {
    return DebtReason.MARKED_FULLY_PAID;
  }
  if (facts.frozen && config.freezePolicy === DebtFreezePolicy.EXEMPT_MONTH) {
    return DebtReason.FROZEN;
  }
  if (!facts.hasTrainings && config.noTrainingPolicy === 'EXEMPT') {
    return DebtReason.NO_TRAININGS_YET;
  }
  return null;
}

/** Допуск в тенге: сумма, процент от ожидаемой или ноль. */
function resolveTolerance(config: DebtRulesConfig, expectedAmount: number): number {
  const tolerance = config.partialTolerance;

  if (tolerance.kind === 'FIXED') {
    return tolerance.amount;
  }
  if (tolerance.kind === 'PERCENT') {
    // Процент считается от ожидаемой суммы: 2% от 50 000 — это 1 000 ₽.
    return roundMoney((expectedAmount * tolerance.percent) / 100);
  }
  return 0;
}

/** Деньги хранятся в тенге без копеек: округление до целого. */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
