import {
  DEFAULT_DEBT_RULES,
  DebtExpectedMissing,
  DebtFreezePolicy,
  DebtNoTrainingPolicy,
  type DebtRulesConfig,
} from '@octagon/contracts';

import { DebtReason, evaluateDebt, type DebtFacts } from './debt-calculator';

/**
 * Матрица граничных тестов из ADR-0014 (K5).
 *
 * Каждый случай соответствует строке таблицы спецификации. Тесты проверяют
 * чистую функцию: те же данные, что получает расчет должников, но без БД.
 */
describe('правила задолженности: матрица ADR-0014', () => {
  const facts = (overrides: Partial<DebtFacts> = {}): DebtFacts => ({
    athleteId: 'athlete-1',
    firstName: 'Али',
    lastName: 'Серик',
    fullyPaidMarked: false,
    frozen: false,
    hasTrainings: true,
    expectedAmount: 50_000,
    paidAmount: 50_000,
    ...overrides,
  });

  const withRules = (overrides: Partial<DebtRulesConfig>): DebtRulesConfig => ({
    ...DEFAULT_DEBT_RULES,
    ...overrides,
  });

  it('1. незаданная сумма, дефолт — должник без остатка', () => {
    const decision = evaluateDebt(DEFAULT_DEBT_RULES, facts({ expectedAmount: null }));

    expect(decision).toEqual({ isDebtor: true, outstanding: null, reason: null });
  });

  it('2. незаданная сумма, NOT_DEBTOR — не должник', () => {
    const decision = evaluateDebt(
      withRules({ expectedMissing: DebtExpectedMissing.NOT_DEBTOR }),
      facts({ expectedAmount: null }),
    );

    expect(decision.isDebtor).toBe(false);
    expect(decision.outstanding).toBeNull();
  });

  it('3. частичная оплата без допуска — должник с остатком', () => {
    const decision = evaluateDebt(DEFAULT_DEBT_RULES, facts({ paidAmount: 40_000 }));

    expect(decision.isDebtor).toBe(true);
    expect(decision.outstanding).toBe(10_000);
  });

  it('4. остаток равен допуску — не должник (граница включительно)', () => {
    const decision = evaluateDebt(
      withRules({ partialTolerance: { kind: 'FIXED', amount: 10_000 } }),
      facts({ paidAmount: 40_000 }),
    );

    expect(decision.isDebtor).toBe(false);
  });

  it('5. остаток больше допуска — должник', () => {
    const decision = evaluateDebt(
      withRules({ partialTolerance: { kind: 'FIXED', amount: 9_999 } }),
      facts({ paidAmount: 40_000 }),
    );

    expect(decision.isDebtor).toBe(true);
  });

  it('6. недоплата ровно 2% при допуске 2% — не должник', () => {
    const decision = evaluateDebt(
      withRules({ partialTolerance: { kind: 'PERCENT', percent: 2 } }),
      facts({ paidAmount: 49_000 }),
    );

    expect(decision.isDebtor).toBe(false);
  });

  it('7. недоплата 4% при допуске 2% — должник', () => {
    const decision = evaluateDebt(
      withRules({ partialTolerance: { kind: 'PERCENT', percent: 2 } }),
      facts({ paidAmount: 48_000 }),
    );

    expect(decision.isDebtor).toBe(true);
  });

  it('8. полная оплата — не должник', () => {
    const decision = evaluateDebt(
      withRules({ partialTolerance: { kind: 'FIXED', amount: 5_000 } }),
      facts(),
    );

    expect(decision.isDebtor).toBe(false);
    expect(decision.outstanding).toBe(0);
  });

  it('9. переплата — не должник', () => {
    const decision = evaluateDebt(DEFAULT_DEBT_RULES, facts({ paidAmount: 60_000 }));

    expect(decision.isDebtor).toBe(false);
    expect(decision.outstanding).toBe(-10_000);
  });

  it('10. возврат возвращает долг: зачтено 0 после полного возврата', () => {
    // `paidAmount` — нетто (ADR-0010): 50 000 внесено и 50 000 возвращено.
    const decision = evaluateDebt(DEFAULT_DEBT_RULES, facts({ paidAmount: 0 }));

    expect(decision.isDebtor).toBe(true);
    expect(decision.outstanding).toBe(50_000);
  });

  it('11. отметка «полностью оплачен» — не должник', () => {
    const decision = evaluateDebt(
      DEFAULT_DEBT_RULES,
      facts({ paidAmount: 0, fullyPaidMarked: true }),
    );

    expect(decision.isDebtor).toBe(false);
    expect(decision.reason).toBe(DebtReason.MARKED_FULLY_PAID);
  });

  it('12. отметка не учитывается — должник по расчету', () => {
    const decision = evaluateDebt(
      withRules({ useFullyPaidMark: false }),
      facts({ paidAmount: 0, fullyPaidMarked: true }),
    );

    expect(decision.isDebtor).toBe(true);
    expect(decision.reason).toBeNull();
  });

  it('13. заморозка освобождает месяц', () => {
    const decision = evaluateDebt(DEFAULT_DEBT_RULES, facts({ paidAmount: 0, frozen: true }));

    expect(decision.isDebtor).toBe(false);
    expect(decision.reason).toBe(DebtReason.FROZEN);
  });

  it('14. заморозка не освобождает, если политика NONE', () => {
    const decision = evaluateDebt(
      withRules({ freezePolicy: DebtFreezePolicy.NONE }),
      facts({ paidAmount: 0, frozen: true }),
    );

    expect(decision.isDebtor).toBe(true);
  });

  it('15. без тренировок — не должник', () => {
    const decision = evaluateDebt(DEFAULT_DEBT_RULES, facts({ paidAmount: 0, hasTrainings: false }));

    expect(decision.isDebtor).toBe(false);
    expect(decision.reason).toBe(DebtReason.NO_TRAININGS_YET);
  });

  it('16. без тренировок, политика DEBTOR — должник', () => {
    const decision = evaluateDebt(
      withRules({ noTrainingPolicy: DebtNoTrainingPolicy.DEBTOR }),
      facts({ paidAmount: 0, hasTrainings: false }),
    );

    expect(decision.isDebtor).toBe(true);
    expect(decision.reason).toBeNull();
  });

  it('26. нулевая ожидаемая сумма — не должник', () => {
    const decision = evaluateDebt(DEFAULT_DEBT_RULES, facts({ expectedAmount: 0, paidAmount: 0 }));

    expect(decision.isDebtor).toBe(false);
    expect(decision.outstanding).toBe(0);
  });

  it('27. допуск 100% — должников нет', () => {
    const decision = evaluateDebt(
      withRules({ partialTolerance: { kind: 'PERCENT', percent: 100 } }),
      facts({ paidAmount: 40_000 }),
    );

    expect(decision.isDebtor).toBe(false);
  });

  it('порядок причин: отметка об оплате важнее заморозки', () => {
    // Причина должна быть одна и та же в списке и в preview; порядок проверок
    // задан ADR-0014: сначала решение клуба об оплате, затем заморозка.
    const decision = evaluateDebt(
      DEFAULT_DEBT_RULES,
      facts({ paidAmount: 0, fullyPaidMarked: true, frozen: true, hasTrainings: false }),
    );

    expect(decision.reason).toBe(DebtReason.MARKED_FULLY_PAID);
  });

  it('допуск не влияет на незаданную сумму', () => {
    // Допуск — про недоплату; когда суммы нет, сравнивать не с чем.
    const decision = evaluateDebt(
      withRules({ partialTolerance: { kind: 'PERCENT', percent: 50 } }),
      facts({ expectedAmount: null }),
    );

    expect(decision.isDebtor).toBe(true);
  });
});
