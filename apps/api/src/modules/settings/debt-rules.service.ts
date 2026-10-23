import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  DEFAULT_DEBT_RULES,
  type DebtRulesConfig,
  type DebtRulesVersionView,
  type DebtTolerance,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { DebtRulesRepository, type DebtRuleRecord } from './debt-rules.repository';

/** Изменение правил: настройки и месяц вступления. */
export interface CreateDebtRulesInput extends DebtRulesConfig {
  /** Месяц вступления в силу, `YYYY-MM`. */
  effectiveFrom: string;
  note?: string | null;
}

/**
 * Правила расчета задолженности (K5, ADR-0014).
 *
 * Версии, а не «текущие настройки»: отчет за октябрь считается по октябрьским
 * правилам, даже если в ноябре их изменили. Дефолтная версия (v1) воспроизводит
 * BR-004 и создается миграцией.
 *
 * Доступ закрыт SuperadminGuard на контроллере: финансовое правило не
 * делегируется через индивидуальные grants.
 */
@Injectable()
export class DebtRulesService {
  private readonly logger = new Logger(DebtRulesService.name);

  constructor(
    private readonly repository: DebtRulesRepository,
    private readonly audit: AuditService,
  ) {}

  /** Действующая версия для месяца (`YYYY-MM`). */
  async getForMonth(month: string): Promise<DebtRulesVersionView> {
    const monthStart = startOfMonth(month);
    const record = await this.repository.findForMonth(monthStart);

    // Версия 1 создается миграцией, но расчет не должен падать, если строку
    // удалили руками: возвращаем дефолт BR-004.
    return record ? toView(record) : toDefaultView(month);
  }

  /** Настройки для расчета за конкретную дату (внутри месяца). */
  async getConfigForDate(date: Date): Promise<DebtRulesConfig> {
    const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const record = await this.repository.findForMonth(monthStart);

    return record ? toConfig(record) : DEFAULT_DEBT_RULES;
  }

  /** История версий: новые сверху. */
  async listVersions(): Promise<DebtRulesVersionView[]> {
    const records = await this.repository.list();
    return records.map(toView);
  }

  /**
   * Новая версия правил.
   *
   * Дата вступления не может быть в прошлом (ADR-0014): ретроспективное
   * изменение молча переписало бы уже отправленные отчеты. Изменение влияет на
   * текущий и будущие месяцы.
   */
  async create(callerUserId: string, input: CreateDebtRulesInput): Promise<DebtRulesVersionView> {
    const effectiveFrom = startOfMonth(input.effectiveFrom);
    const currentMonth = startOfCurrentMonth();

    if (effectiveFrom < currentMonth) {
      throw new ApiException(
        'DEBT_RULES_EFFECTIVE_IN_PAST' satisfies ApiErrorCode,
        'Дата вступления не может быть в прошлом: история не пересчитывается',
      );
    }

    const existing = await this.repository.findByEffectiveFrom(effectiveFrom);
    if (existing) {
      throw new ApiException(
        'DEBT_RULES_VERSION_CONFLICT' satisfies ApiErrorCode,
        `Правила с ${input.effectiveFrom} уже существуют (версия ${existing.version})`,
      );
    }

    const tolerance = normalizeTolerance(input.partialTolerance);
    const latest = await this.repository.findLatest();
    const record = await this.repository.create({
      effectiveFrom,
      version: (latest?.version ?? 0) + 1,
      useFullyPaidMark: input.useFullyPaidMark,
      noTrainingPolicy: input.noTrainingPolicy,
      freezePolicy: input.freezePolicy,
      expectedMissing: input.expectedMissing,
      toleranceKind: tolerance.kind,
      toleranceAmount: tolerance.amount,
      tolerancePercent: tolerance.percent,
      note: input.note?.trim() ? input.note.trim().slice(0, 500) : null,
      createdById: callerUserId,
    });

    await this.audit.recordSafely({
      action: AuditAction.SETTINGS_DEBT_RULES_UPDATED,
      entityType: AuditEntityType.DEBT_RULE,
      entityId: record.id,
      actorUserId: callerUserId,
      before: latest ? toConfig(latest) : DEFAULT_DEBT_RULES,
      after: toConfig(record),
    });

    this.logger.log(`Правила долга: версия ${record.version} с ${input.effectiveFrom}`);
    return toView(record);
  }
}

/** `YYYY-MM` → первое число месяца в UTC. */
export function startOfMonth(month: string): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!match) {
    throw new ApiException(
      'VALIDATION_FAILED' satisfies ApiErrorCode,
      'Месяц должен быть в формате YYYY-MM',
    );
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new ApiException('VALIDATION_FAILED' satisfies ApiErrorCode, 'Месяц вне диапазона 01–12');
  }

  return new Date(Date.UTC(year, monthNumber - 1, 1));
}

/** Первое число текущего месяца в UTC. */
export function startOfCurrentMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Проверка и приведение допуска к паре «вид + значение». */
function normalizeTolerance(tolerance: DebtTolerance): {
  kind: 'NONE' | 'FIXED' | 'PERCENT';
  amount: number | null;
  percent: number | null;
} {
  if (tolerance.kind === 'NONE') {
    return { kind: 'NONE', amount: null, percent: null };
  }

  if (tolerance.kind === 'FIXED') {
    if (!Number.isFinite(tolerance.amount) || tolerance.amount < 0) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Допуск суммой должен быть неотрицательным числом',
      );
    }
    return { kind: 'FIXED', amount: tolerance.amount, percent: null };
  }

  if (!Number.isFinite(tolerance.percent) || tolerance.percent < 0 || tolerance.percent > 100) {
    throw new ApiException(
      'VALIDATION_FAILED' satisfies ApiErrorCode,
      'Допуск процентом должен быть в диапазоне 0–100',
    );
  }
  return { kind: 'PERCENT', amount: null, percent: tolerance.percent };
}

/** Запись БД → конфигурация расчета. */
export function toConfig(record: DebtRuleRecord): DebtRulesConfig {
  const tolerance: DebtTolerance =
    record.toleranceKind === 'FIXED'
      ? { kind: 'FIXED', amount: record.toleranceAmount ?? 0 }
      : record.toleranceKind === 'PERCENT'
        ? { kind: 'PERCENT', percent: record.tolerancePercent ?? 0 }
        : { kind: 'NONE' };

  return {
    useFullyPaidMark: record.useFullyPaidMark,
    noTrainingPolicy: record.noTrainingPolicy,
    freezePolicy: record.freezePolicy,
    expectedMissing: record.expectedMissing,
    partialTolerance: tolerance,
  };
}

/** Запись БД → ответ API. */
export function toView(record: DebtRuleRecord): DebtRulesVersionView {
  return {
    ...toConfig(record),
    version: record.version,
    effectiveFrom: record.effectiveFrom.toISOString().slice(0, 10),
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    note: record.note,
    // Версия 1 — эталон BR-004: менять ее нельзя, иначе регрессия станет не с чем
    // сравнивать.
    isDefault: record.version === 1,
  };
}

/** Дефолтная версия для случая, когда строк в БД нет. */
function toDefaultView(month: string): DebtRulesVersionView {
  return {
    ...DEFAULT_DEBT_RULES,
    version: 1,
    effectiveFrom: `${month}-01`,
    createdBy: null,
    createdAt: new Date(0).toISOString(),
    note: 'Значения по умолчанию: BR-004',
    isDefault: true,
  };
}

