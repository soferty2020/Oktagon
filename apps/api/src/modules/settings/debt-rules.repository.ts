import { Injectable } from '@nestjs/common';
import type {
  DebtExpectedMissing,
  DebtFreezePolicy,
  DebtNoTrainingPolicy,
} from '@octagon/contracts';
import { PrismaService } from '../../prisma/prisma.service';

/** Версия правил в том виде, в каком она хранится. */
export interface DebtRuleRecord {
  id: string;
  version: number;
  effectiveFrom: Date;
  useFullyPaidMark: boolean;
  noTrainingPolicy: DebtNoTrainingPolicy;
  freezePolicy: DebtFreezePolicy;
  expectedMissing: DebtExpectedMissing;
  /** Вид допуска: взаимоисключающие варианты, дублирует CHECK в БД. */
  toleranceKind: 'NONE' | 'FIXED' | 'PERCENT';
  toleranceAmount: number | null;
  tolerancePercent: number | null;
  note: string | null;
  createdAt: Date;
  createdBy: { id: string; email: string } | null;
}

export interface CreateDebtRuleInput {
  effectiveFrom: Date;
  /** Монотонный номер версии: вычисляется сервисом как max + 1. */
  version: number;
  useFullyPaidMark: boolean;
  noTrainingPolicy: DebtNoTrainingPolicy;
  freezePolicy: DebtFreezePolicy;
  expectedMissing: DebtExpectedMissing;
  /** Вид допуска: взаимоисключающие варианты, дублирует CHECK в БД. */
  toleranceKind: 'NONE' | 'FIXED' | 'PERCENT';
  toleranceAmount: number | null;
  tolerancePercent: number | null;
  note: string | null;
  createdById: string;
}

/** Доступ к версиям правил долга. Абстракция как DI-токен: сервис тестируется без БД. */
export abstract class DebtRulesRepository {
  /** Версия, действовавшая в месяце (наибольшая `effectiveFrom` ≤ начала месяца). */
  abstract findForMonth(monthStart: Date): Promise<DebtRuleRecord | null>;
  abstract findLatest(): Promise<DebtRuleRecord | null>;
  abstract findByEffectiveFrom(effectiveFrom: Date): Promise<DebtRuleRecord | null>;
  abstract list(): Promise<DebtRuleRecord[]>;
  abstract create(input: CreateDebtRuleInput): Promise<DebtRuleRecord>;
}

const RULE_SELECT = {
  id: true,
  version: true,
  effectiveFrom: true,
  useFullyPaidMark: true,
  noTrainingPolicy: true,
  freezePolicy: true,
  expectedMissing: true,
  toleranceKind: true,
  toleranceAmount: true,
  tolerancePercent: true,
  note: true,
  createdAt: true,
  createdBy: { select: { id: true, email: true } },
} as const;

@Injectable()
export class PrismaDebtRulesRepository extends DebtRulesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findForMonth(monthStart: Date): Promise<DebtRuleRecord | null> {
    const record = await this.prisma.db.debtRule.findFirst({
      where: { effectiveFrom: { lte: monthStart } },
      orderBy: { effectiveFrom: 'desc' },
      select: RULE_SELECT,
    });

    return record ? toRecord(record) : null;
  }

  async findLatest(): Promise<DebtRuleRecord | null> {
    const record = await this.prisma.db.debtRule.findFirst({
      orderBy: { version: 'desc' },
      select: RULE_SELECT,
    });

    return record ? toRecord(record) : null;
  }

  async findByEffectiveFrom(effectiveFrom: Date): Promise<DebtRuleRecord | null> {
    const record = await this.prisma.db.debtRule.findUnique({
      where: { effectiveFrom },
      select: RULE_SELECT,
    });

    return record ? toRecord(record) : null;
  }

  async list(): Promise<DebtRuleRecord[]> {
    const records = await this.prisma.db.debtRule.findMany({
      orderBy: { version: 'desc' },
      select: RULE_SELECT,
    });

    return records.map(toRecord);
  }

  async create(input: CreateDebtRuleInput): Promise<DebtRuleRecord> {
    const record = await this.prisma.db.debtRule.create({
      data: input,
      select: RULE_SELECT,
    });

    return toRecord(record);
  }
}

/**
 * Приводит запись БД к доменному виду.
 *
 * Decimal из Prisma превращается в number: суммы в тенге целые, и держать
 * Decimal в сервисе расчета незачем. Допуск и процент разделены, потому что
 * CHECK-ограничение запрещает заполнять оба сразу.
 */
function toRecord(record: {
  id: string;
  version: number;
  effectiveFrom: Date;
  useFullyPaidMark: boolean;
  noTrainingPolicy: DebtNoTrainingPolicy;
  freezePolicy: DebtFreezePolicy;
  expectedMissing: DebtExpectedMissing;
  /** Вид допуска: взаимоисключающие варианты, дублирует CHECK в БД. */
  toleranceKind: 'NONE' | 'FIXED' | 'PERCENT';
  toleranceAmount: unknown;
  tolerancePercent: unknown;
  note: string | null;
  createdAt: Date;
  createdBy: { id: string; email: string } | null;
}): DebtRuleRecord {
  return {
    id: record.id,
    version: record.version,
    effectiveFrom: record.effectiveFrom,
    useFullyPaidMark: record.useFullyPaidMark,
    noTrainingPolicy: record.noTrainingPolicy,
    freezePolicy: record.freezePolicy,
    expectedMissing: record.expectedMissing,
    toleranceKind: record.toleranceKind,
    toleranceAmount:
      record.toleranceAmount === null || record.toleranceAmount === undefined
        ? null
        : Number(record.toleranceAmount),
    tolerancePercent:
      record.tolerancePercent === null || record.tolerancePercent === undefined
        ? null
        : Number(record.tolerancePercent),
    note: record.note,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
  };
}
