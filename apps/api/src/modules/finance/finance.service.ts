import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  DebtorExemption,
  type DebtorSummary,
  type MembershipPeriodView,
  type PaymentMethod,
  type PaymentView,
  type RecordPaymentInput,
  type UpdateMembershipPeriodInput,
  type UpdatePaymentInput,
} from '@octagon/contracts';

import {
  AthleteStatus as PrismaAthleteStatus,
  MembershipPeriodStatus as PrismaPeriodStatus,
  PaymentMethod as PrismaPaymentMethod,
} from '../../../generated/prisma';
import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
// Обычные импорты, не `import type`: репозитории — DI-токены, их значения
// должны попасть в метаданные конструктора (emitDecoratorMetadata).
import { FreezeRepository } from '../freezes/freezes.repository';
import { ResourceScopeService } from '../identity/resource-scope.service';
import { FinanceRepository } from './finance.repository';
import type { MembershipPeriodRecord, PaymentRecord } from './finance.repository';

/**
 * Финансы: расчетные периоды, оплаты и задолженность (эпик F).
 *
 * Спецификация: BR-001 (учет по календарным месяцам), BR-002 (произвольная
 * сумма), BR-003 (ручная отметка «оплачен полностью»), BR-004 (задолженность по
 * четырем условиям), BR-010 (доступ только с явным финансовым правом).
 *
 * Ключевое правило: статус периода никогда не вводится руками — он выводится из
 * суммы оплат и ручной отметки. Иначе отметка «оплачено» расходилась бы с
 * фактическими поступлениями.
 *
 * Заморозки (BR-005) обслуживает отдельный модуль, но задолженность обязана их
 * учитывать: заморозка — четвертое условие BR-004.
 */
@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly finance: FinanceRepository,
    private readonly freezes: FreezeRepository,
    private readonly scope: ResourceScopeService,
    private readonly audit: AuditService,
  ) {}

  // --- Расчетные периоды ---------------------------------------------------

  /**
   * Период за месяц: создается при первом обращении.
   *
   * Период нужен и для просмотра: иначе администратор не увидел бы, что месяц
   * вообще не заведен, и не смог бы внести оплату.
   */
  async getPeriod(
    callerUserId: string,
    athleteId: string,
    year: number,
    month: number,
  ): Promise<MembershipPeriodView> {
    await this.scope.assertAthleteAccess(callerUserId, athleteId);
    this.assertMonth(month);

    const period = await this.ensurePeriod(athleteId, year, month);
    return toPeriodView(period);
  }

  /** Несколько периодов сразу: нужно карточке спортсмена для истории. */
  async listPeriods(
    callerUserId: string,
    athleteId: string,
    year: number,
  ): Promise<MembershipPeriodView[]> {
    await this.scope.assertAthleteAccess(callerUserId, athleteId);

    const periods: MembershipPeriodView[] = [];
    for (let month = 1; month <= 12; month += 1) {
      const existing = await this.finance.findPeriod(athleteId, year, month);
      if (existing) {
        periods.push(toPeriodView(existing));
      }
    }
    return periods;
  }

  /** Изменение ожидаемой суммы и заметки: сама сумма вводится вручную (BR-002). */
  async updatePeriod(
    callerUserId: string,
    periodId: string,
    input: UpdateMembershipPeriodInput,
  ): Promise<MembershipPeriodView> {
    const period = await this.requirePeriod(periodId);
    await this.scope.assertAthleteAccess(callerUserId, period.athleteId);

    if (input.expectedAmount !== undefined && input.expectedAmount !== null) {
      if (input.expectedAmount < 0) {
        throw new ApiException(
          'PAYMENT_AMOUNT_INVALID' satisfies ApiErrorCode,
          'Ожидаемая сумма не может быть отрицательной',
        );
      }
    }

    const updated = await this.finance.updatePeriod(periodId, input);
    const recalculated = await this.recalculate(updated);

    await this.audit.recordSafely({
      action: AuditAction.MEMBERSHIP_PERIOD_UPDATED,
      entityType: AuditEntityType.MEMBERSHIP_PERIOD,
      entityId: periodId,
      before: { expectedAmount: period.expectedAmount, note: period.note },
      after: { expectedAmount: updated.expectedAmount, note: updated.note },
    });

    return toPeriodView(recalculated);
  }

  /**
   * Ручная отметка «оплачен полностью» (BR-003).
   *
   * Суперадминистратор может отметить месяц оплаченным независимо от суммы: в
   * клубе бывают расчеты вне системы. Отметка снимается тем же методом.
   */
  async setFullyPaid(
    callerUserId: string,
    periodId: string,
    marked: boolean,
  ): Promise<MembershipPeriodView> {
    const period = await this.requirePeriod(periodId);
    await this.scope.assertAthleteAccess(callerUserId, period.athleteId);

    const updated = await this.finance.setFullyPaidMark(
      periodId,
      marked ? new Date() : null,
      marked ? callerUserId : null,
    );

    await this.audit.recordSafely({
      action: marked
        ? AuditAction.PERIOD_MARKED_FULLY_PAID
        : AuditAction.PERIOD_FULLY_PAID_UNMARKED,
      entityType: AuditEntityType.MEMBERSHIP_PERIOD,
      entityId: periodId,
      before: { fullyPaidMarkedAt: period.fullyPaidMarkedAt?.toISOString() ?? null },
      after: { marked },
    });

    return toPeriodView(updated);
  }

  // --- Оплаты --------------------------------------------------------------

  /**
   * Вносит оплату.
   *
   * Сумма произвольная (BR-002): для спортсмена, пришедшего в середине месяца,
   * она может быть любой. При наличии ключа идемпотентности повторная отправка
   * возвращает уже созданную оплату, а не создает вторую.
   */
  async recordPayment(
    callerUserId: string,
    periodId: string,
    input: RecordPaymentInput,
  ): Promise<MembershipPeriodView> {
    const period = await this.requirePeriod(periodId);
    await this.scope.assertAthleteAccess(callerUserId, period.athleteId);

    if (!(input.amount > 0)) {
      throw new ApiException(
        'PAYMENT_AMOUNT_INVALID' satisfies ApiErrorCode,
        'Сумма оплаты должна быть больше нуля',
      );
    }

    if (input.idempotencyKey) {
      const existing = await this.finance.findPaymentByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        // Повторная отправка: возвращаем текущее состояние периода.
        return toPeriodView(await this.recalculate(period));
      }
    }

    const payment = await this.finance.createPayment({
      periodId,
      athleteId: period.athleteId,
      amount: input.amount,
      method: (input.method ?? 'CASH') as PrismaPaymentMethod,
      paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
      comment: input.comment ?? null,
      createdById: callerUserId,
      idempotencyKey: input.idempotencyKey ?? null,
    });

    const recalculated = await this.recalculate(period);

    await this.audit.recordSafely({
      action: AuditAction.PAYMENT_RECORDED,
      entityType: AuditEntityType.PAYMENT_TRANSACTION,
      entityId: payment.id,
      after: {
        periodId,
        athleteId: period.athleteId,
        amount: payment.amount,
        method: payment.method,
      },
    });

    this.logger.log(
      `Оплата ${payment.amount} по периоду ${periodId} (${period.year}-${period.month})`,
    );

    return toPeriodView(recalculated);
  }

  async updatePayment(
    callerUserId: string,
    paymentId: string,
    input: UpdatePaymentInput,
  ): Promise<MembershipPeriodView> {
    const payment = await this.requirePayment(paymentId);
    const period = await this.requirePeriodForPayment(paymentId);
    await this.scope.assertAthleteAccess(callerUserId, period.athleteId);

    if (input.amount !== undefined && !(input.amount > 0)) {
      throw new ApiException(
        'PAYMENT_AMOUNT_INVALID' satisfies ApiErrorCode,
        'Сумма оплаты должна быть больше нуля',
      );
    }

    await this.finance.updatePayment(paymentId, {
      amount: input.amount,
      method: input.method as PrismaPaymentMethod | undefined,
      paidAt: input.paidAt ? new Date(input.paidAt) : undefined,
      comment: input.comment,
    });

    const recalculated = await this.recalculate(period);

    await this.audit.recordSafely({
      action: AuditAction.PAYMENT_UPDATED,
      entityType: AuditEntityType.PAYMENT_TRANSACTION,
      entityId: paymentId,
      before: { amount: payment.amount, method: payment.method },
      after: { amount: input.amount ?? payment.amount },
    });

    return toPeriodView(recalculated);
  }

  /**
   * Отменяет оплату.
   *
   * Запись удаляется, а период пересчитывается: ошибка ввода не должна
   * оставаться в истории как факт поступления денег.
   */
  async voidPayment(callerUserId: string, paymentId: string): Promise<MembershipPeriodView> {
    const payment = await this.requirePayment(paymentId);
    const period = await this.requirePeriodForPayment(paymentId);
    await this.scope.assertAthleteAccess(callerUserId, period.athleteId);

    await this.finance.deletePayment(paymentId);
    const recalculated = await this.recalculate(period);

    await this.audit.recordSafely({
      action: AuditAction.PAYMENT_VOIDED,
      entityType: AuditEntityType.PAYMENT_TRANSACTION,
      entityId: paymentId,
      before: { amount: payment.amount, periodId: period.id },
    });

    return toPeriodView(recalculated);
  }

  // --- Задолженность (BR-004) ---------------------------------------------

  /**
   * Список должников за месяц.
   *
   * Спортсмен считается должником, если одновременно: он активен; месяц не
   * отмечен как полностью оплаченный; в месяце уже была хотя бы одна тренировка
   * его группы; он не в заморозке на соответствующую дату.
   *
   * Причина «не должник» возвращается явно: руководителю важно отличать решение
   * (заморозка, отметка об оплате) от отсутствия данных.
   */
  async listDebtors(callerUserId: string, year: number, month: number): Promise<DebtorSummary[]> {
    this.assertMonth(month);

    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));

    const [athletes, memberships, frozenIds, existingPeriods] = await Promise.all([
      this.finance.listActiveAthletes(),
      this.finance.athleteIdsWithMembershipInMonth(from, to),
      this.freezes.listFrozenAthleteIds(from),
      this.finance.listPeriodsForMonth(year, month),
    ]);

    const memberIds = new Set(memberships.map((membership) => membership.athleteId));
    const frozen = new Set(frozenIds);
    const periodByAthlete = new Map(existingPeriods.map((period) => [period.athleteId, period]));

    const summaries: DebtorSummary[] = [];

    for (const athlete of athletes) {
      // Условие 1: спортсмен активен. Заморозка карточки (FROZEN) — тоже
      // основание не считать его должником: занятия приостановлены.
      if (athlete.status !== PrismaAthleteStatus.ACTIVE) {
        continue;
      }
      // Рассматриваются только те, у кого в этом месяце было членство: иначе
      // список заполнился бы всеми спортсменами клуба.
      if (!memberIds.has(athlete.athleteId)) {
        continue;
      }

      const period = periodByAthlete.get(athlete.athleteId) ?? null;
      const paidAmount = period?.paidAmount ?? 0;

      let reason: DebtorExemption | null = null;

      if (period?.fullyPaidMarkedAt) {
        // Условие 2: месяц отмечен как полностью оплаченный (BR-003).
        reason = DebtorExemption.MARKED_FULLY_PAID;
      } else if (frozen.has(athlete.athleteId)) {
        // Условие 4: спортсмен в заморозке на соответствующую дату.
        reason = DebtorExemption.FROZEN;
      } else if (!(await this.finance.hasGroupTrainingInMonth(athlete.athleteId, from, to))) {
        // Условие 3: в месяце еще не было ни одной тренировки группы.
        reason = DebtorExemption.NO_TRAININGS_YET;
      }

      summaries.push({
        athleteId: athlete.athleteId,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        year,
        month,
        paidAmount,
        expectedAmount: period?.expectedAmount ?? null,
        isDebtor: reason === null,
        reason,
      });
    }

    // Должники сверху: список нужен прежде всего для работы с ними.
    return summaries.sort(
      (a, b) =>
        Number(b.isDebtor) - Number(a.isDebtor) ||
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName),
    );
  }

  // --- Вспомогательное -----------------------------------------------------

  private async ensurePeriod(
    athleteId: string,
    year: number,
    month: number,
  ): Promise<MembershipPeriodRecord> {
    const existing = await this.finance.findPeriod(athleteId, year, month);
    if (existing) {
      return this.recalculate(existing);
    }

    const created = await this.finance.createPeriod({ athleteId, year, month });
    return this.recalculate(created);
  }

  /**
   * Пересчитывает статус периода по фактическим оплатам.
   *
   * Ручная отметка «оплачен полностью» имеет приоритет (BR-003): она ставится
   * именно тогда, когда сумма в системе не совпадает с реальностью.
   */
  private async recalculate(period: MembershipPeriodRecord): Promise<MembershipPeriodRecord> {
    const paidAmount = await this.finance.sumPayments(period.id);
    const status = deriveStatus({
      fullyPaidMarked: period.fullyPaidMarkedAt !== null,
      paidAmount,
      expectedAmount: period.expectedAmount,
    });

    if (paidAmount === period.paidAmount && status === period.status) {
      return period;
    }

    return this.finance.refreshPeriodTotals(period.id, paidAmount, status);
  }

  private assertMonth(month: number): void {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Месяц должен быть целым числом от 1 до 12',
      );
    }
  }

  private async requirePeriod(periodId: string): Promise<MembershipPeriodRecord> {
    const period = await this.finance.findPeriodById(periodId);
    if (!period) {
      throw new ApiException(
        'MEMBERSHIP_PERIOD_NOT_FOUND' satisfies ApiErrorCode,
        'Расчетный период не найден',
      );
    }
    return period;
  }

  private async requirePeriodForPayment(paymentId: string): Promise<MembershipPeriodRecord> {
    const payment = await this.requirePayment(paymentId);
    const period = await this.finance.findPeriodById(payment.periodId);
    if (!period) {
      throw new ApiException(
        'MEMBERSHIP_PERIOD_NOT_FOUND' satisfies ApiErrorCode,
        'Расчетный период оплаты не найден',
      );
    }
    return period;
  }

  private async requirePayment(paymentId: string): Promise<PaymentRecord> {
    const payment = await this.finance.findPayment(paymentId);
    if (!payment) {
      throw new ApiException('PAYMENT_NOT_FOUND' satisfies ApiErrorCode, 'Оплата не найдена');
    }
    return payment;
  }

}

/** Статус периода выводится из оплат и ручной отметки, а не вводится руками. */
function deriveStatus(input: {
  fullyPaidMarked: boolean;
  paidAmount: number;
  expectedAmount: number | null;
}): PrismaPeriodStatus {
  if (input.fullyPaidMarked) {
    return PrismaPeriodStatus.FULLY_PAID_MARKED;
  }
  if (input.paidAmount <= 0) {
    return PrismaPeriodStatus.UNPAID;
  }
  // Без заданной ожидаемой суммы нельзя судить о полноте: считаем, что оплачено.
  if (input.expectedAmount === null) {
    return PrismaPeriodStatus.PAID;
  }
  return input.paidAmount >= input.expectedAmount
    ? PrismaPeriodStatus.PAID
    : PrismaPeriodStatus.PARTIALLY_PAID;
}

function toCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toPaymentView(payment: PaymentRecord): PaymentView {
  return {
    id: payment.id,
    amount: payment.amount,
    method: payment.method as PaymentMethod,
    paidAt: toCalendarDate(payment.paidAt),
    comment: payment.comment,
    createdById: payment.createdById,
    createdAt: payment.createdAt.toISOString(),
  };
}

function toPeriodView(period: MembershipPeriodRecord): MembershipPeriodView {
  return {
    id: period.id,
    athleteId: period.athleteId,
    year: period.year,
    month: period.month,
    expectedAmount: period.expectedAmount,
    paidAmount: period.paidAmount,
    status: period.status,
    fullyPaidMarkedAt: period.fullyPaidMarkedAt?.toISOString() ?? null,
    fullyPaidMarkedById: period.fullyPaidMarkedById,
    note: period.note,
    payments: period.payments.map(toPaymentView),
  };
}
