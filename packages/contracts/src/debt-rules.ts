/**
 * Настраиваемые правила задолженности (K5, ADR-0014, BR-014).
 *
 * Конфигурация версионируется: отчет за месяц считается по версии, действовавшей
 * в этом месяце. Значения по умолчанию совпадают с BR-004 — дефолт не «еще не
 * настроено», а конкретное правило.
 */

/** Что делать, если в месяце не было ни одной тренировки группы. */
export const DebtNoTrainingPolicy = {
  /** Не считать должником (BR-004). */
  EXEMPT: 'EXEMPT',
  DEBTOR: 'DEBTOR',
} as const;
export type DebtNoTrainingPolicy =
  (typeof DebtNoTrainingPolicy)[keyof typeof DebtNoTrainingPolicy];

/** Освобождает ли заморозка от задолженности за месяц. */
export const DebtFreezePolicy = {
  EXEMPT_MONTH: 'EXEMPT_MONTH',
  NONE: 'NONE',
} as const;
export type DebtFreezePolicy = (typeof DebtFreezePolicy)[keyof typeof DebtFreezePolicy];

/** Как поступать с незаданной ожидаемой суммой. */
export const DebtExpectedMissing = {
  /** Считать должником (BR-004): клуб еще не решил, сколько брать. */
  DEBTOR: 'DEBTOR',
  NOT_DEBTOR: 'NOT_DEBTOR',
} as const;
export type DebtExpectedMissing =
  (typeof DebtExpectedMissing)[keyof typeof DebtExpectedMissing];

/**
 * Допустимая недоплата.
 *
 * Взаимоисключающие варианты: допуск задается либо суммой, либо процентом, но не
 * обоими сразу — иначе пришлось бы решать, какое значение важнее.
 */
export type DebtTolerance =
  | { kind: 'NONE' }
  | { kind: 'FIXED'; amount: number }
  | { kind: 'PERCENT'; percent: number };

/** Настройки целиком. */
export interface DebtRulesConfig {
  useFullyPaidMark: boolean;
  noTrainingPolicy: DebtNoTrainingPolicy;
  freezePolicy: DebtFreezePolicy;
  expectedMissing: DebtExpectedMissing;
  partialTolerance: DebtTolerance;
}

/** Версия правил для админки. */
export interface DebtRulesVersionView extends DebtRulesConfig {
  version: number;
  /** Первое число месяца действия, YYYY-MM-DD. */
  effectiveFrom: string;
  createdBy: { id: string; email: string } | null;
  createdAt: string;
  note: string | null;
  /** Версия по умолчанию (BR-004): ее нельзя изменить, она эталон регрессии. */
  isDefault: boolean;
}

/** Сравнение текущего и предлагаемого правила. */
export interface DebtRulesPreview {
  /** Месяц, к которому применится версия (`YYYY-MM`). */
  effectiveFrom: string;
  debtorsBefore: number;
  debtorsAfter: number;
  /** Суммарная задолженность в тенге; `null`, если есть должники без ожидаемой суммы. */
  debtBefore: number | null;
  debtAfter: number | null;
  /** Кто изменит статус: показываются первые 20. */
  changed: Array<{
    athleteId: string;
    name: string;
    wasDebtor: boolean;
    willBeDebtor: boolean;
    /** Остаток; `null`, если ожидаемая сумма не задана. */
    outstanding: number | null;
  }>;
}

/** Значения по умолчанию: BR-004, воспроизводится бит-в-бит. */
export const DEFAULT_DEBT_RULES: DebtRulesConfig = {
  useFullyPaidMark: true,
  noTrainingPolicy: DebtNoTrainingPolicy.EXEMPT,
  freezePolicy: DebtFreezePolicy.EXEMPT_MONTH,
  expectedMissing: DebtExpectedMissing.DEBTOR,
  partialTolerance: { kind: 'NONE' },
};

/** Человеческое описание правила — для журнала и подсказок в интерфейсе. */
export function describeDebtRules(config: DebtRulesConfig): string {
  const parts = [
    config.useFullyPaidMark ? 'отметка «оплачено» учитывается' : 'отметка «оплачено» не учитывается',
    config.noTrainingPolicy === DebtNoTrainingPolicy.EXEMPT
      ? 'без тренировок не должник'
      : 'без тренировок должник',
    config.freezePolicy === DebtFreezePolicy.EXEMPT_MONTH
      ? 'заморозка освобождает'
      : 'заморозка не освобождает',
    config.expectedMissing === DebtExpectedMissing.DEBTOR
      ? 'без ожидаемой суммы должник'
      : 'без ожидаемой суммы не должник',
    config.partialTolerance.kind === 'FIXED'
      ? `допуск ${config.partialTolerance.amount} ₸`
      : config.partialTolerance.kind === 'PERCENT'
        ? `допуск ${config.partialTolerance.percent}%`
        : 'без допуска',
  ];

  return parts.join(', ');
}
