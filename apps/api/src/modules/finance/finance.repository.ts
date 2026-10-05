import { Injectable } from '@nestjs/common';
import {
  AthleteStatus,
  MembershipPeriodStatus,
  PaymentMethod,
  TrainingSessionStatus,
} from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

export interface PaymentRecord {
  id: string;
  /** Период, к которому относится оплата. */
  periodId: string;
  amount: number;
  method: PaymentMethod;
  paidAt: Date;
  comment: string | null;
  createdById: string | null;
  createdAt: Date;
}

export interface MembershipPeriodRecord {
  id: string;
  athleteId: string;
  year: number;
  month: number;
  expectedAmount: number | null;
  paidAmount: number;
  status: MembershipPeriodStatus;
  fullyPaidMarkedAt: Date | null;
  fullyPaidMarkedById: string | null;
  note: string | null;
  payments: PaymentRecord[];
}

/** Спортсмен, у которого есть расчетный период за месяц. */
export interface BillingAthleteRecord {
  athleteId: string;
  firstName: string;
  lastName: string;
  status: AthleteStatus;
}


/**
 * Доступ к финансам.
 *
 * Абстрактный класс как DI-токен: сервис не зависит от Prisma и тестируется
 * без БД (docs/13-architecture.md).
 */
export abstract class FinanceRepository {
  abstract findPeriod(
    athleteId: string,
    year: number,
    month: number,
  ): Promise<MembershipPeriodRecord | null>;
  abstract findPeriodById(id: string): Promise<MembershipPeriodRecord | null>;
  abstract createPeriod(input: {
    athleteId: string;
    year: number;
    month: number;
  }): Promise<MembershipPeriodRecord>;
  /** Пересчитывает статус и сумму по фактическим оплатам. */
  abstract refreshPeriodTotals(
    periodId: string,
    paidAmount: number,
    status: MembershipPeriodStatus,
  ): Promise<MembershipPeriodRecord>;
  abstract updatePeriod(
    periodId: string,
    input: { expectedAmount?: number | null; note?: string | null },
  ): Promise<MembershipPeriodRecord>;
  /** BR-003: ручная отметка «оплачен полностью» или ее снятие. */
  abstract setFullyPaidMark(
    periodId: string,
    markedAt: Date | null,
    markedById: string | null,
  ): Promise<MembershipPeriodRecord>;
  /** Периоды за месяц: нужны списку должников. */
  abstract listPeriodsForMonth(
    year: number,
    month: number,
  ): Promise<MembershipPeriodRecord[]>;

  abstract createPayment(input: {
    periodId: string;
    athleteId: string;
    amount: number;
    method: PaymentMethod;
    paidAt: Date;
    comment: string | null;
    createdById: string;
    idempotencyKey: string | null;
  }): Promise<PaymentRecord>;
  abstract findPaymentByIdempotencyKey(key: string): Promise<PaymentRecord | null>;
  abstract findPayment(id: string): Promise<PaymentRecord | null>;
  abstract updatePayment(
    id: string,
    input: {
      amount?: number;
      method?: PaymentMethod;
      paidAt?: Date;
      comment?: string | null;
    },
  ): Promise<PaymentRecord>;
  abstract deletePayment(id: string): Promise<boolean>;
  /** Сумма проведенных оплат периода. */
  abstract sumPayments(periodId: string): Promise<number>;

  abstract findAthlete(
    athleteId: string,
  ): Promise<{ id: string; firstName: string; lastName: string } | null>;
  /** Активные спортсмены с членством в любой группе: кандидаты на оплату. */
  abstract listActiveAthletes(): Promise<BillingAthleteRecord[]>;
  abstract athleteIdsWithMembershipInMonth(
    from: Date,
    to: Date,
  ): Promise<{ athleteId: string; joinedAt: Date; leftAt: Date | null }[]>;
  /** Есть ли занятия группы спортсмена в месяце (BR-004, условие 3). */
  abstract hasGroupTrainingInMonth(athleteId: string, from: Date, to: Date): Promise<boolean>;
}

const PAYMENT_SELECT = {
  id: true,
  membershipPeriodId: true,
  amount: true,
  method: true,
  paidAt: true,
  comment: true,
  createdById: true,
  createdAt: true,
} as const;

@Injectable()
export class PrismaFinanceRepository extends FinanceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findPeriod(
    athleteId: string,
    year: number,
    month: number,
  ): Promise<MembershipPeriodRecord | null> {
    const period = await this.prisma.db.membershipPeriod.findUnique({
      where: { athleteId_year_month: { athleteId, year, month } },
      select: {
        id: true,
        athleteId: true,
        year: true,
        month: true,
        expectedAmount: true,
        paidAmount: true,
        status: true,
        fullyPaidMarkedAt: true,
        fullyPaidMarkedById: true,
        note: true,
        payments: { select: PAYMENT_SELECT, orderBy: { paidAt: 'asc' } },
      },
    });

    return period ? toPeriodRecord(period) : null;
  }

  async findPeriodById(id: string): Promise<MembershipPeriodRecord | null> {
    const period = await this.prisma.db.membershipPeriod.findUnique({
      where: { id },
      select: {
        id: true,
        athleteId: true,
        year: true,
        month: true,
        expectedAmount: true,
        paidAmount: true,
        status: true,
        fullyPaidMarkedAt: true,
        fullyPaidMarkedById: true,
        note: true,
        payments: { select: PAYMENT_SELECT, orderBy: { paidAt: 'asc' } },
      },
    });

    return period ? toPeriodRecord(period) : null;
  }

  async createPeriod(input: {
    athleteId: string;
    year: number;
    month: number;
  }): Promise<MembershipPeriodRecord> {
    const period = await this.prisma.db.membershipPeriod.create({
      data: { athleteId: input.athleteId, year: input.year, month: input.month },
      select: {
        id: true,
        athleteId: true,
        year: true,
        month: true,
        expectedAmount: true,
        paidAmount: true,
        status: true,
        fullyPaidMarkedAt: true,
        fullyPaidMarkedById: true,
        note: true,
        payments: { select: PAYMENT_SELECT },
      },
    });

    return toPeriodRecord(period);
  }

  async refreshPeriodTotals(
    periodId: string,
    paidAmount: number,
    status: MembershipPeriodStatus,
  ): Promise<MembershipPeriodRecord> {
    const period = await this.prisma.db.membershipPeriod.update({
      where: { id: periodId },
      data: { paidAmount, status },
      select: {
        id: true,
        athleteId: true,
        year: true,
        month: true,
        expectedAmount: true,
        paidAmount: true,
        status: true,
        fullyPaidMarkedAt: true,
        fullyPaidMarkedById: true,
        note: true,
        payments: { select: PAYMENT_SELECT, orderBy: { paidAt: 'asc' } },
      },
    });

    return toPeriodRecord(period);
  }

  async updatePeriod(
    periodId: string,
    input: { expectedAmount?: number | null; note?: string | null },
  ): Promise<MembershipPeriodRecord> {
    const period = await this.prisma.db.membershipPeriod.update({
      where: { id: periodId },
      data: {
        ...(input.expectedAmount !== undefined ? { expectedAmount: input.expectedAmount } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
      select: {
        id: true,
        athleteId: true,
        year: true,
        month: true,
        expectedAmount: true,
        paidAmount: true,
        status: true,
        fullyPaidMarkedAt: true,
        fullyPaidMarkedById: true,
        note: true,
        payments: { select: PAYMENT_SELECT, orderBy: { paidAt: 'asc' } },
      },
    });

    return toPeriodRecord(period);
  }

  async setFullyPaidMark(
    periodId: string,
    markedAt: Date | null,
    markedById: string | null,
  ): Promise<MembershipPeriodRecord> {
    const period = await this.prisma.db.membershipPeriod.update({
      where: { id: periodId },
      data: { fullyPaidMarkedAt: markedAt, fullyPaidMarkedById: markedById },
      select: {
        id: true,
        athleteId: true,
        year: true,
        month: true,
        expectedAmount: true,
        paidAmount: true,
        status: true,
        fullyPaidMarkedAt: true,
        fullyPaidMarkedById: true,
        note: true,
        payments: { select: PAYMENT_SELECT, orderBy: { paidAt: 'asc' } },
      },
    });

    return toPeriodRecord(period);
  }

  async listPeriodsForMonth(year: number, month: number): Promise<MembershipPeriodRecord[]> {
    const periods = await this.prisma.db.membershipPeriod.findMany({
      where: { year, month },
      select: {
        id: true,
        athleteId: true,
        year: true,
        month: true,
        expectedAmount: true,
        paidAmount: true,
        status: true,
        fullyPaidMarkedAt: true,
        fullyPaidMarkedById: true,
        note: true,
        payments: { select: PAYMENT_SELECT },
      },
    });

    return periods.map(toPeriodRecord);
  }

  async createPayment(input: {
    periodId: string;
    athleteId: string;
    amount: number;
    method: PaymentMethod;
    paidAt: Date;
    comment: string | null;
    createdById: string;
    idempotencyKey: string | null;
  }): Promise<PaymentRecord> {
    const payment = await this.prisma.db.paymentTransaction.create({
      data: {
        membershipPeriodId: input.periodId,
        athleteId: input.athleteId,
        amount: input.amount,
        method: input.method,
        paidAt: input.paidAt,
        comment: input.comment,
        createdById: input.createdById,
        idempotencyKey: input.idempotencyKey,
      },
      select: PAYMENT_SELECT,
    });

    return toPaymentRecord(payment);
  }

  async findPaymentByIdempotencyKey(key: string): Promise<PaymentRecord | null> {
    const payment = await this.prisma.db.paymentTransaction.findUnique({
      where: { idempotencyKey: key },
      select: PAYMENT_SELECT,
    });

    return payment ? toPaymentRecord(payment) : null;
  }

  async findPayment(id: string): Promise<PaymentRecord | null> {
    const payment = await this.prisma.db.paymentTransaction.findUnique({
      where: { id },
      select: PAYMENT_SELECT,
    });

    return payment ? toPaymentRecord(payment) : null;
  }

  async updatePayment(
    id: string,
    input: {
      amount?: number;
      method?: PaymentMethod;
      paidAt?: Date;
      comment?: string | null;
    },
  ): Promise<PaymentRecord> {
    const payment = await this.prisma.db.paymentTransaction.update({
      where: { id },
      data: {
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.method !== undefined ? { method: input.method } : {}),
        ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
        ...(input.comment !== undefined ? { comment: input.comment } : {}),
      },
      select: PAYMENT_SELECT,
    });

    return toPaymentRecord(payment);
  }

  async deletePayment(id: string): Promise<boolean> {
    const result = await this.prisma.db.paymentTransaction.deleteMany({ where: { id } });
    return result.count > 0;
  }

  async sumPayments(periodId: string): Promise<number> {
    const result = await this.prisma.db.paymentTransaction.aggregate({
      where: { membershipPeriodId: periodId },
      _sum: { amount: true },
    });

    return Number(result._sum.amount ?? 0);
  }

  async findAthlete(
    athleteId: string,
  ): Promise<{ id: string; firstName: string; lastName: string } | null> {
    return this.prisma.db.athlete.findFirst({
      where: { id: athleteId, archivedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
  }

  async listActiveAthletes(): Promise<BillingAthleteRecord[]> {
    const athletes = await this.prisma.db.athlete.findMany({
      where: { archivedAt: null, status: { not: AthleteStatus.ARCHIVED } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, status: true },
    });

    return athletes.map((athlete) => ({
      athleteId: athlete.id,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      status: athlete.status,
    }));
  }

  async athleteIdsWithMembershipInMonth(
    from: Date,
    to: Date,
  ): Promise<{ athleteId: string; joinedAt: Date; leftAt: Date | null }[]> {
    const memberships = await this.prisma.db.groupMembership.findMany({
      where: {
        // Членство пересекает месяц, если оно началось до его конца и либо не
        // закончилось, либо закончилось после его начала.
        joinedAt: { lte: to },
        OR: [{ leftAt: null }, { leftAt: { gte: from } }],
        athlete: { archivedAt: null },
      },
      select: { athleteId: true, joinedAt: true, leftAt: true },
    });

    return memberships;
  }

  async hasGroupTrainingInMonth(athleteId: string, from: Date, to: Date): Promise<boolean> {
    const session = await this.prisma.db.trainingSession.findFirst({
      where: {
        startsAt: { gte: from, lt: to },
        status: { not: TrainingSessionStatus.CANCELLED },
        group: {
          memberships: { some: { athleteId } },
        },
      },
      select: { id: true },
    });

    return session !== null;
  }
}

function toPaymentRecord(payment: {
  id: string;
  membershipPeriodId: string;
  amount: unknown;
  method: PaymentMethod;
  paidAt: Date;
  comment: string | null;
  createdById: string | null;
  createdAt: Date;
}): PaymentRecord {
  return {
    id: payment.id,
    periodId: payment.membershipPeriodId,
    // Decimal из Prisma приводится к числу: контракт использует number.
    amount: Number(payment.amount),
    method: payment.method,
    paidAt: payment.paidAt,
    comment: payment.comment,
    createdById: payment.createdById,
    createdAt: payment.createdAt,
  };
}

function toPeriodRecord(period: {
  id: string;
  athleteId: string;
  year: number;
  month: number;
  expectedAmount: unknown;
  paidAmount: unknown;
  status: MembershipPeriodStatus;
  fullyPaidMarkedAt: Date | null;
  fullyPaidMarkedById: string | null;
  note: string | null;
  payments: {
    id: string;
    membershipPeriodId: string;
    amount: unknown;
    method: PaymentMethod;
    paidAt: Date;
    comment: string | null;
    createdById: string | null;
    createdAt: Date;
  }[];
}): MembershipPeriodRecord {
  return {
    id: period.id,
    athleteId: period.athleteId,
    year: period.year,
    month: period.month,
    expectedAmount: period.expectedAmount === null ? null : Number(period.expectedAmount),
    paidAmount: Number(period.paidAmount),
    status: period.status,
    fullyPaidMarkedAt: period.fullyPaidMarkedAt,
    fullyPaidMarkedById: period.fullyPaidMarkedById,
    note: period.note,
    payments: period.payments.map(toPaymentRecord),
  };
}
