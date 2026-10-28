import { Injectable } from '@nestjs/common';
import {
  AthleteStatus,
  MembershipPeriodStatus,
  PaymentKind,
  PaymentMethod,
  TrainingSessionStatus,
} from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

export interface PaymentRecord {
  id: string;
  /** Период, к которому относится транзакция. */
  periodId: string;
  /** ADR-0010: PAYMENT — поступление, REFUND — возврат. */
  kind: PaymentKind;
  amount: number;
  method: PaymentMethod;
  paidAt: Date;
  comment: string | null;
  /** ADR-0010: поступление, к которому привязан возврат. */
  refundedPaymentId: string | null;
  createdById: string | null;
  createdAt: Date;
}

export interface MembershipPeriodRecord {
  id: string;
  athleteId: string;
  year: number;
  month: number;
  expectedAmount: number | null;
  /** Зачтено: поступления минус возвраты (ADR-0010). */
  paidAmount: number;
  /** Сколько всего возвращено по периоду (ADR-0010). */
  refundedAmount: number;
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

/** Движение средств для выгрузки: строка будущего CSV. */
export interface PaymentExportRecord {
  id: string;
  paidAt: Date;
  kind: PaymentKind;
  amount: number;
  method: string | null;
  athleteLastName: string;
  athleteFirstName: string;
  groupName: string | null;
  /** Комментарий к оплате; в выгрузке помогает бухгалтеру. */
  note: string | null;
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
  /**
   * Пересчитывает зачтенную сумму и статус по фактическим движениям.
   *
   * ADR-0010: обе величины (`paidAmount` — нетто и `refundedAmount`) пишутся
   * вместе, поэтому разойтись не могут.
   */
  abstract refreshPeriodTotals(
    periodId: string,
    paidAmount: number,
    refundedAmount: number,
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
  abstract listPeriodsForMonth(year: number, month: number): Promise<MembershipPeriodRecord[]>;

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
  /** Сумма поступлений периода (kind = PAYMENT), без вычета возвратов. */
  abstract sumPayments(periodId: string): Promise<number>;
  /** Сумма возвратов периода (kind = REFUND). */
  abstract sumRefunds(periodId: string): Promise<number>;

  // --- Возвраты (ADR-0010) --------------------------------------------------

  abstract createRefund(input: {
    periodId: string;
    athleteId: string;
    amount: number;
    method: PaymentMethod;
    refundedAt: Date;
    comment: string | null;
    refundedPaymentId: string | null;
    createdById: string;
    idempotencyKey: string | null;
  }): Promise<PaymentRecord>;
  /**
   * Удаляет возврат, только если это действительно возврат.
   *
   * Отдельно от `deletePayment`: отмена возврата и отмена ошибочного
   * поступления — разные операции, и случайно удалить поступление этим методом
   * нельзя (ADR-0010).
   */
  abstract deleteRefund(id: string): Promise<boolean>;
  /** Возвраты, привязанные к поступлению: нужны для проверки лимита. */
  abstract findRefundsByPayment(paymentId: string): Promise<PaymentRecord[]>;
  abstract countRefundsByPayment(paymentId: string): Promise<number>;

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

  // --- Сводка (F8) ----------------------------------------------------------

  /**
   * Движения средств, dated в диапазоне, с филиалом получателя.
   *
   * Отбор идет по дате движения (`paidAt`), а не по расчетному периоду: сводка
   * отвечает на вопрос «сколько денег прошло в этом месяце», а не «сколько
   * начислено за этот месяц». Филлиал определяется основным филиалом группы
   * спортсмена на момент запроса.
   */
  abstract listMovementsInRange(
    from: Date,
    to: Date,
  ): Promise<{ kind: PaymentKind; amount: number; hallId: string | null }[]>;

  /**
   * Движения за период с деталями для выгрузки в CSV.
   *
   * Отдельный метод, а не расширение `listMovementsInRange`: сводке нужны только
   * суммы, и тянуть имена и способы оплаты на каждый месяц было бы лишней работой.
   */
  abstract listPaymentsForExport(from: Date, to: Date): Promise<PaymentExportRecord[]>;
  /**
   * Основной филиал каждого спортсмена: `null` — филиал не назначен.
   *
   * Возвращается словарем: сводка раскладывает должников по филиалам, а
   * спортсмен без филиала должен попасть в отдельную строку, а не исчезнуть.
   */
  abstract hallsForAthletes(
    athleteIds: string[],
  ): Promise<Map<string, { hallId: string; hallName: string }>>;
  /** Названия филиалов: нужны, чтобы показать движение без должников. */
  abstract listHalls(): Promise<{ id: string; name: string }[]>;
}

const PAYMENT_SELECT = {
  id: true,
  membershipPeriodId: true,
  kind: true,
  amount: true,
  method: true,
  paidAt: true,
  comment: true,
  refundedPaymentId: true,
  createdById: true,
  createdAt: true,
} as const;

/** Поля периода: `payments` — лента движений, включая возвраты (ADR-0010). */
const PERIOD_SELECT = {
  id: true,
  athleteId: true,
  year: true,
  month: true,
  expectedAmount: true,
  paidAmount: true,
  refundedAmount: true,
  status: true,
  fullyPaidMarkedAt: true,
  fullyPaidMarkedById: true,
  note: true,
  payments: { select: PAYMENT_SELECT, orderBy: { createdAt: 'asc' } },
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
      select: PERIOD_SELECT,
    });

    return period ? toPeriodRecord(period) : null;
  }

  async findPeriodById(id: string): Promise<MembershipPeriodRecord | null> {
    const period = await this.prisma.db.membershipPeriod.findUnique({
      where: { id },
      select: PERIOD_SELECT,
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
      select: PERIOD_SELECT,
    });

    return toPeriodRecord(period);
  }

  async refreshPeriodTotals(
    periodId: string,
    paidAmount: number,
    refundedAmount: number,
    status: MembershipPeriodStatus,
  ): Promise<MembershipPeriodRecord> {
    const period = await this.prisma.db.membershipPeriod.update({
      where: { id: periodId },
      data: { paidAmount, refundedAmount, status },
      select: PERIOD_SELECT,
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
      select: PERIOD_SELECT,
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
      select: PERIOD_SELECT,
    });

    return toPeriodRecord(period);
  }

  async listPeriodsForMonth(year: number, month: number): Promise<MembershipPeriodRecord[]> {
    const periods = await this.prisma.db.membershipPeriod.findMany({
      where: { year, month },
      select: PERIOD_SELECT,
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
        // Направление задается явно, а не значением по умолчанию в схеме: так
        // намерение видно в коде, а не только в миграции (ADR-0010).
        kind: PaymentKind.PAYMENT,
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
    // Возвраты исключены явно: это сумма поступлений, а не зачтенная сумма.
    // Иначе `sumPayments` и «нетто» стали бы одним и тем же именем с разным
    // смыслом, и проверки лимита возврата считались бы по завышенной базе.
    const result = await this.prisma.db.paymentTransaction.aggregate({
      where: { membershipPeriodId: periodId, kind: PaymentKind.PAYMENT },
      _sum: { amount: true },
    });

    return Number(result._sum.amount ?? 0);
  }

  async sumRefunds(periodId: string): Promise<number> {
    const result = await this.prisma.db.paymentTransaction.aggregate({
      where: { membershipPeriodId: periodId, kind: PaymentKind.REFUND },
      _sum: { amount: true },
    });

    return Number(result._sum.amount ?? 0);
  }

  async createRefund(input: {
    periodId: string;
    athleteId: string;
    amount: number;
    method: PaymentMethod;
    refundedAt: Date;
    comment: string | null;
    refundedPaymentId: string | null;
    createdById: string;
    idempotencyKey: string | null;
  }): Promise<PaymentRecord> {
    const refund = await this.prisma.db.paymentTransaction.create({
      data: {
        membershipPeriodId: input.periodId,
        athleteId: input.athleteId,
        kind: PaymentKind.REFUND,
        amount: input.amount,
        method: input.method,
        paidAt: input.refundedAt,
        comment: input.comment,
        refundedPaymentId: input.refundedPaymentId,
        createdById: input.createdById,
        idempotencyKey: input.idempotencyKey,
      },
      select: PAYMENT_SELECT,
    });

    return toPaymentRecord(refund);
  }

  async deleteRefund(id: string): Promise<boolean> {
    const result = await this.prisma.db.paymentTransaction.deleteMany({
      where: { id, kind: PaymentKind.REFUND },
    });
    return result.count > 0;
  }

  async findRefundsByPayment(paymentId: string): Promise<PaymentRecord[]> {
    const refunds = await this.prisma.db.paymentTransaction.findMany({
      where: { refundedPaymentId: paymentId, kind: PaymentKind.REFUND },
      select: PAYMENT_SELECT,
    });

    return refunds.map(toPaymentRecord);
  }

  async countRefundsByPayment(paymentId: string): Promise<number> {
    return this.prisma.db.paymentTransaction.count({
      where: { refundedPaymentId: paymentId, kind: PaymentKind.REFUND },
    });
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

  async listMovementsInRange(
    from: Date,
    to: Date,
  ): Promise<{ kind: PaymentKind; amount: number; hallId: string | null }[]> {
    const movements = await this.prisma.db.paymentTransaction.findMany({
      where: { paidAt: { gte: from, lt: to } },
      select: {
        kind: true,
        amount: true,
        athlete: {
          select: {
            memberships: {
              where: { state: 'ACTIVE' },
              orderBy: { joinedAt: 'desc' },
              take: 1,
              select: { group: { select: { hallId: true } } },
            },
          },
        },
      },
    });

    return movements.map((movement) => ({
      kind: movement.kind,
      amount: Number(movement.amount),
      hallId: movement.athlete.memberships[0]?.group.hallId ?? null,
    }));
  }

  async listPaymentsForExport(from: Date, to: Date): Promise<PaymentExportRecord[]> {
    const movements = await this.prisma.db.paymentTransaction.findMany({
      where: { paidAt: { gte: from, lt: to } },
      orderBy: { paidAt: 'asc' },
      select: {
        id: true,
        paidAt: true,
        kind: true,
        amount: true,
        method: true,
        comment: true,
        athlete: {
          select: {
            firstName: true,
            lastName: true,
            memberships: {
              where: { state: 'ACTIVE' },
              orderBy: { joinedAt: 'desc' },
              take: 1,
              select: { group: { select: { name: true } } },
            },
          },
        },
      },
    });

    return movements.map((movement) => ({
      id: movement.id,
      paidAt: movement.paidAt,
      kind: movement.kind,
      amount: Number(movement.amount),
      method: movement.method,
      athleteLastName: movement.athlete.lastName,
      athleteFirstName: movement.athlete.firstName,
      groupName: movement.athlete.memberships[0]?.group.name ?? null,
      note: movement.comment,
    }));
  }

  async hallsForAthletes(
    athleteIds: string[],
  ): Promise<Map<string, { hallId: string; hallName: string }>> {
    if (athleteIds.length === 0) {
      return new Map();
    }

    const memberships = await this.prisma.db.groupMembership.findMany({
      where: { athleteId: { in: athleteIds }, state: 'ACTIVE' },
      orderBy: { joinedAt: 'desc' },
      select: {
        athleteId: true,
        group: { select: { hall: { select: { id: true, name: true } } } },
      },
    });

    const result = new Map<string, { hallId: string; hallName: string }>();
    for (const membership of memberships) {
      // Первое членство для каждого спортсмена: выборка отсортирована по дате
      // вступления, поэтому более позднее членство перекрывает раннее.
      const hall = membership.group.hall;
      if (hall && !result.has(membership.athleteId)) {
        result.set(membership.athleteId, { hallId: hall.id, hallName: hall.name });
      }
    }
    return result;
  }

  async listHalls(): Promise<{ id: string; name: string }[]> {
    return this.prisma.db.hall.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }
}

function toPaymentRecord(payment: {
  id: string;
  membershipPeriodId: string;
  amount: unknown;
  kind: PaymentKind;
  method: PaymentMethod;
  paidAt: Date;
  comment: string | null;
  refundedPaymentId: string | null;
  createdById: string | null;
  createdAt: Date;
}): PaymentRecord {
  return {
    id: payment.id,
    periodId: payment.membershipPeriodId,
    kind: payment.kind,
    // Decimal из Prisma приводится к числу: контракт использует number.
    amount: Number(payment.amount),
    method: payment.method,
    paidAt: payment.paidAt,
    comment: payment.comment,
    refundedPaymentId: payment.refundedPaymentId,
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
  refundedAmount: unknown;
  status: MembershipPeriodStatus;
  fullyPaidMarkedAt: Date | null;
  fullyPaidMarkedById: string | null;
  note: string | null;
  payments: {
    id: string;
    membershipPeriodId: string;
    kind: PaymentKind;
    amount: unknown;
    method: PaymentMethod;
    paidAt: Date;
    comment: string | null;
    refundedPaymentId: string | null;
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
    // Поле добавлено миграцией с DEFAULT 0, но у записей, созданных до нее,
    // значение могло остаться NULL: приводим к нулю, а не к NaN.
    refundedAmount: Number(period.refundedAmount ?? 0),
    status: period.status,
    fullyPaidMarkedAt: period.fullyPaidMarkedAt,
    fullyPaidMarkedById: period.fullyPaidMarkedById,
    note: period.note,
    payments: period.payments.map(toPaymentRecord),
  };
}
