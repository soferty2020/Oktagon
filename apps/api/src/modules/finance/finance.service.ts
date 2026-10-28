import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AthletePaymentStatus,
  AuditAction,
  AuditEntityType,
  DebtorExemption,
  PaymentKind,
  paymentMonthLabel,
  paymentStatusMessage,
  type HallFinanceSummary,
  type AthletePaymentStatusView,
  type DebtorSummary,
  type DebtRulesConfig,
  type DebtRulesPreview,
  type FinanceDynamics,
  type FinanceDynamicsPoint,
  type FinanceSummary,
  type FinanceTotals,
  type MembershipPeriodView,
  type PaymentMethod,
  type PaymentView,
  type RecordPaymentInput,
  type RefundPaymentInput,
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
import { evaluateDebt, type DebtFacts } from '../settings/debt-calculator';
import { DebtRulesService } from '../settings/debt-rules.service';
import { SettingsService } from '../settings/settings.service';
import { FinanceRepository } from './finance.repository';
import type { MembershipPeriodRecord, PaymentRecord } from './finance.repository';

/**
 * Финансы: расчетные периоды, движения средств и задолженность (эпик F).
 *
 * Спецификация: BR-001 (учет по календарным месяцам), BR-002 (произвольная
 * сумма), BR-003 (ручная отметка «оплачен полностью»), BR-004 (задолженность по
 * четырем условиям), BR-010 (доступ только с явным финансовым правом),
 * ADR-0010 (возврат — отдельное движение средств).
 *
 * Ключевые правила:
 *
 * 1. статус периода никогда не вводится руками — он выводится из движений и
 *    ручной отметки. Иначе отметка «оплачено» расходилась бы с поступлениями;
 * 2. зачтено = поступления − возвраты (ADR-0010). Возвращенные деньги не
 *    считаются оплатой: иначе задолженность осталась бы завышенной;
 * 3. возврат — не удаление поступления. Отмена оплаты стирает запись, потому что
 *    денег не было; возврат фиксирует, что деньги были и ушли, и остается в
 *    истории.
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
    // Правила долга приходят из настроек: финансы знают, как считать, но не
    // решают, каким правилом (K5, ADR-0014).
    private readonly debtRules: DebtRulesService,
    // Срок оплаты — настройка клуба: сервис его применяет, но не хранит (K1).
    private readonly settings: SettingsService,
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

    // Пересчет обязателен: сама отметка меняет только поле отметки, а статус
    // периода выводится из нее. Без пересчета период остался бы «не оплачен».
    const recalculated = await this.recalculate(updated);

    await this.audit.recordSafely({
      action: marked
        ? AuditAction.PERIOD_MARKED_FULLY_PAID
        : AuditAction.PERIOD_FULLY_PAID_UNMARKED,
      entityType: AuditEntityType.MEMBERSHIP_PERIOD,
      entityId: periodId,
      before: { fullyPaidMarkedAt: period.fullyPaidMarkedAt?.toISOString() ?? null },
      after: { marked },
    });

    return toPeriodView(recalculated);
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

    // Возврат правится не «изменением оплаты», а отменой и повторным
    // оформлением: иначе можно было бы тихо изменить возврат, не привязанный к
    // поступлению, и лимит по периоду остался бы соблюден только на бумаге.
    if (payment.kind === PaymentKind.REFUND) {
      throw new ApiException(
        'REFUND_PAYMENT_MISMATCH' satisfies ApiErrorCode,
        'Возврат нельзя изменить: отмените его и оформите заново',
        { refundId: paymentId },
      );
    }

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

    // ADR-0010: поступление с возвратами удалять нельзя — возврат потерял бы
    // основание, и в истории осталась бы операция без источника.
    const refunds = await this.finance.countRefundsByPayment(paymentId);
    if (refunds > 0) {
      throw new ApiException(
        'PAYMENT_HAS_REFUNDS' satisfies ApiErrorCode,
        'По оплате есть возвраты: сначала отмените их, потом удаляйте оплату',
        { refunds },
      );
    }

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

  // --- Возвраты (ADR-0010) --------------------------------------------------

  /**
   * Оформляет возврат денег по периоду.
   *
   * Возврат не удаляет поступление: он фиксирует, что деньги были получены и
   * возвращены. Зачтенная сумма периода уменьшается, статус пересчитывается.
   *
   * Проверки:
   * - сумма положительна;
   * - при привязке к поступлению оно принадлежит тому же периоду;
   * - возвратов по поступлению не больше его суммы;
   * - возвратов по периоду не больше поступлений периода. Вернуть больше, чем
   *   получено, — не возврат, а ошибка ввода.
   */
  async refundPayment(
    callerUserId: string,
    periodId: string,
    input: RefundPaymentInput,
  ): Promise<MembershipPeriodView> {
    const period = await this.requirePeriod(periodId);
    await this.scope.assertAthleteAccess(callerUserId, period.athleteId);

    if (!(input.amount > 0)) {
      throw new ApiException(
        'PAYMENT_AMOUNT_INVALID' satisfies ApiErrorCode,
        'Сумма возврата должна быть больше нуля',
      );
    }

    // Идемпотентность проверяется раньше лимитов: при повторной отправке той же
    // формы возврат уже учтен в сумме периода, и проверка лимита отклонила бы
    // повторное нажатие как «возврат больше, чем поступило». Клиент вместо
    // текущего состояния периода получил бы ошибку.
    if (input.idempotencyKey) {
      const existing = await this.finance.findPaymentByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return toPeriodView(await this.recalculate(period));
      }
    }

    // --- Привязка к поступлению --------------------------------------------
    let refundedPaymentId: string | null = null;
    if (input.paymentId) {
      const source = await this.finance.findPayment(input.paymentId);
      if (!source) {
        throw new ApiException('PAYMENT_NOT_FOUND' satisfies ApiErrorCode, 'Оплата не найдена');
      }
      if (source.periodId !== periodId) {
        throw new ApiException(
          'REFUND_PAYMENT_MISMATCH' satisfies ApiErrorCode,
          'Возврат относится к оплате другого расчетного периода',
          { paymentId: source.id, periodId: source.periodId },
        );
      }
      if (source.kind === PaymentKind.REFUND) {
        // Возврат возврата: почти всегда это выбор не той строки в интерфейсе.
        throw new ApiException(
          'REFUND_PAYMENT_MISMATCH' satisfies ApiErrorCode,
          'Возврат нельзя привязать к другой операции возврата',
          { paymentId: source.id },
        );
      }

      const alreadyRefunded = (await this.finance.findRefundsByPayment(source.id)).reduce(
        (sum, refund) => sum + refund.amount,
        0,
      );
      if (alreadyRefunded + input.amount > source.amount) {
        throw new ApiException(
          'REFUND_EXCEEDS_PAYMENT' satisfies ApiErrorCode,
          'По этой оплате возвращено больше, чем получено',
          { paymentAmount: source.amount, refunded: alreadyRefunded, requested: input.amount },
        );
      }

      refundedPaymentId = source.id;
    }

    // --- Лимит по периоду --------------------------------------------------
    const [paidTotal, refundedTotal] = await Promise.all([
      this.finance.sumPayments(periodId),
      this.finance.sumRefunds(periodId),
    ]);

    if (refundedTotal + input.amount > paidTotal) {
      throw new ApiException(
        'REFUND_EXCEEDS_PAYMENT' satisfies ApiErrorCode,
        'Возврат больше, чем поступило по этому периоду',
        { paid: paidTotal, refunded: refundedTotal, requested: input.amount },
      );
    }

    const refund = await this.finance.createRefund({
      periodId,
      athleteId: period.athleteId,
      amount: input.amount,
      method: (input.method ?? 'CASH') as PrismaPaymentMethod,
      refundedAt: input.refundedAt ? new Date(input.refundedAt) : new Date(),
      // Причина возврата — тот же по смыслу текст, что комментарий у оплаты.
      comment: input.reason ?? null,
      refundedPaymentId,
      createdById: callerUserId,
      idempotencyKey: input.idempotencyKey ?? null,
    });

    const recalculated = await this.recalculate(period);

    await this.audit.recordSafely({
      action: AuditAction.PAYMENT_REFUNDED,
      entityType: AuditEntityType.PAYMENT_TRANSACTION,
      entityId: refund.id,
      after: {
        periodId,
        athleteId: period.athleteId,
        amount: refund.amount,
        refundedPaymentId,
        reason: input.reason ?? null,
      },
    });

    this.logger.log(
      `Возврат ${refund.amount} по периоду ${periodId} (${period.year}-${period.month})`,
    );

    return toPeriodView(recalculated);
  }

  /**
   * Отменяет ошибочно оформленный возврат.
   *
   * Запись возврата удаляется, период пересчитывается: возврат, оформленный по
   * ошибке, не должен уменьшать зачтенную сумму.
   */
  async voidRefund(callerUserId: string, refundId: string): Promise<MembershipPeriodView> {
    const refund = await this.requireRefund(refundId);
    const period = await this.requirePeriodForPayment(refundId);
    await this.scope.assertAthleteAccess(callerUserId, period.athleteId);

    await this.finance.deleteRefund(refundId);
    const recalculated = await this.recalculate(period);

    await this.audit.recordSafely({
      action: AuditAction.PAYMENT_REFUND_VOIDED,
      entityType: AuditEntityType.PAYMENT_TRANSACTION,
      entityId: refundId,
      before: {
        amount: refund.amount,
        periodId: period.id,
        refundedPaymentId: refund.refundedPaymentId,
      },
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
    const facts = await this.collectDebtFacts(year, month);
    const config = await this.debtRules.getConfigForDate(from);

    const summaries: DebtorSummary[] = facts.map((fact) => {
      // Правило одно и то же для списка и для preview (K5, ADR-0014): иначе
      // администратор увидел бы в предпросмотре одно, а после сохранения другое.
      const decision = evaluateDebt(config, fact);

      return {
        athleteId: fact.athleteId,
        firstName: fact.firstName,
        lastName: fact.lastName,
        year,
        month,
        paidAmount: fact.paidAmount,
        refundedAmount: fact.refundedAmount,
        expectedAmount: fact.expectedAmount,
        isDebtor: decision.isDebtor,
        reason: decision.reason as DebtorExemption | null,
      };
    });

    // Должники сверху: список нужен прежде всего для работы с ними.
    return summaries.sort(
      (a, b) =>
        Number(b.isDebtor) - Number(a.isDebtor) ||
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName),
    );
  }

  /**
   * Сравнение действующего правила с предлагаемым (K5, ADR-0014).
   *
   * Считается то же самое, что и список должников, но дважды: по текущей версии
   * и по новой. Preview — обязательный шаг перед сохранением, потому что правило
   * меняет финансовую картину месяца.
   */
  async previewDebtRules(month: string, config: DebtRulesConfig): Promise<DebtRulesPreview> {
    const [yearString, monthString] = month.split('-');
    const year = Number(yearString);
    const monthNumber = Number(monthString);
    this.assertMonth(monthNumber);

    const from = new Date(Date.UTC(year, monthNumber - 1, 1));
    const facts = await this.collectDebtFacts(year, monthNumber);
    const current = await this.debtRules.getConfigForDate(from);

    const before = facts.map((fact) => ({ fact, decision: evaluateDebt(current, fact) }));
    const after = facts.map((fact) => ({ fact, decision: evaluateDebt(config, fact) }));

    const changed = before
      .map((entry, index) => ({ entry, next: after[index] }))
      .filter(({ entry, next }) => entry.decision.isDebtor !== next.decision.isDebtor)
      .slice(0, 20)
      .map(({ entry, next }) => ({
        athleteId: entry.fact.athleteId,
        name: `${entry.fact.lastName} ${entry.fact.firstName}`.trim(),
        wasDebtor: entry.decision.isDebtor,
        willBeDebtor: next.decision.isDebtor,
        outstanding: next.decision.outstanding,
      }));

    return {
      effectiveFrom: month,
      debtorsBefore: before.filter((entry) => entry.decision.isDebtor).length,
      debtorsAfter: after.filter((entry) => entry.decision.isDebtor).length,
      debtBefore: sumOutstanding(before),
      debtAfter: sumOutstanding(after),
      changed,
    };
  }

  /**
   * Факты по спортсменам за месяц: данные, а не правила.
   *
   * Собраны отдельно от решения, чтобы один и тот же набор можно было оценить
   * двумя конфигурациями (preview) и чтобы тесты проверяли чистое правило.
   */
  private async collectDebtFacts(
    year: number,
    month: number,
  ): Promise<Array<DebtFacts & { refundedAmount: number }>> {
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

    const facts: Array<DebtFacts & { refundedAmount: number }> = [];

    for (const athlete of athletes) {
      // Спортсмен должен быть активен: заморозка карточки (FROZEN) — тоже
      // основание не считать его должником, занятия приостановлены.
      if (athlete.status !== PrismaAthleteStatus.ACTIVE) {
        continue;
      }
      // Только те, у кого в этом месяце было членство: иначе список заполнился бы
      // всеми спортсменами клуба.
      if (!memberIds.has(athlete.athleteId)) {
        continue;
      }

      const period = periodByAthlete.get(athlete.athleteId) ?? null;

      facts.push({
        athleteId: athlete.athleteId,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        fullyPaidMarked: Boolean(period?.fullyPaidMarkedAt),
        frozen: frozen.has(athlete.athleteId),
        hasTrainings: await this.finance.hasGroupTrainingInMonth(athlete.athleteId, from, to),
        // Ожидаемая сумма не задана — `null`, а не ноль: правило трактует это
        // отдельным случаем (ADR-0014).
        expectedAmount: period?.expectedAmount == null ? null : Number(period.expectedAmount),
        // `paidAmount` уже нетто (поступления минус возвраты, ADR-0010).
        paidAmount: period?.paidAmount ?? 0,
        refundedAmount: period?.refundedAmount ?? 0,
      });
    }

    return facts;
  }

  // --- Сводка за месяц (F8) -------------------------------------------------

  /**
   * Статус оплаты глазами участника (B).
   *
   * Суммы наружу не отдаются: BR-010 закрывает финансы для MEMBER, и решение
   * продукта — показывать только факт. Доступ проверяется не правом, а связью
   * аккаунта со спортсменом: родитель видит статус только своих детей.
   */
  async getAthletePaymentStatus(
    callerUserId: string,
    athleteId: string,
    year: number,
    month: number,
  ): Promise<AthletePaymentStatusView> {
    this.assertMonth(month);
    await this.scope.assertAthleteAccess(callerUserId, athleteId);

    const monthLabel = paymentMonthLabel(year, month);
    const fact = await this.collectAthleteFact(athleteId, year, month);

    // Срок оплаты — настройка клуба: без него сообщение просто не упоминает дату.
    const profile = await this.settings.getClubProfile();
    const dueDate =
      profile.paymentDueDay === null ? null : formatDueDate(year, month, profile.paymentDueDay);

    // Нет членства в месяце — платить не за что. Это не «оплачено» и не долг.
    if (!fact) {
      return {
        athleteId,
        year,
        month,
        monthLabel,
        status: AthletePaymentStatus.NOT_REQUIRED,
        dueDate,
        overdue: false,
        message: paymentStatusMessage(AthletePaymentStatus.NOT_REQUIRED, year, month, { dueDate }),
      };
    }

    const config = await this.debtRules.getConfigForDate(new Date(Date.UTC(year, month - 1, 1)));
    const decision = evaluateDebt(config, fact);

    let status: AthletePaymentStatus;
    if (decision.reason !== null) {
      status = AthletePaymentStatus.NOT_REQUIRED;
    } else if (fact.expectedAmount === null) {
      // Сумма не задана: «должен» здесь вводило бы в заблуждение.
      status = AthletePaymentStatus.UNKNOWN;
    } else if (!decision.isDebtor) {
      status = AthletePaymentStatus.PAID;
    } else if (fact.paidAmount > 0) {
      status = AthletePaymentStatus.PARTIAL;
    } else {
      status = AthletePaymentStatus.NOT_PAID;
    }

    // Просрочка — только для неоплаченного: оплаченный месяц не бывает
    // просроченным, даже если деньги пришли позже срока.
    const unpaid =
      status === AthletePaymentStatus.NOT_PAID || status === AthletePaymentStatus.PARTIAL;
    const overdue = unpaid && dueDate !== null && isDueDatePassed(dueDate);

    return {
      athleteId,
      year,
      month,
      monthLabel,
      status,
      dueDate,
      overdue,
      message: paymentStatusMessage(status, year, month, { dueDate, overdue }),
    };
  }

  /**
   * Факты по одному спортсмену.
   *
   * Отдельно от `collectDebtFacts`: экран главной открывается на каждого
   * спортсмена, и собирать список всего клуба ради одной карточки незачем.
   */
  private async collectAthleteFact(
    athleteId: string,
    year: number,
    month: number,
  ): Promise<(DebtFacts & { refundedAmount: number }) | null> {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));

    const [period, memberships, frozenIds, hasTrainings] = await Promise.all([
      this.finance.findPeriod(athleteId, year, month),
      this.finance.athleteIdsWithMembershipInMonth(from, to),
      this.freezes.listFrozenAthleteIds(from),
      this.finance.hasGroupTrainingInMonth(athleteId, from, to),
    ]);

    if (!memberships.some((membership) => membership.athleteId === athleteId)) {
      return null;
    }

    return {
      athleteId,
      firstName: '',
      lastName: '',
      fullyPaidMarked: Boolean(period?.fullyPaidMarkedAt),
      frozen: frozenIds.includes(athleteId),
      hasTrainings,
      expectedAmount: period?.expectedAmount == null ? null : Number(period.expectedAmount),
      paidAmount: period?.paidAmount ?? 0,
      refundedAmount: period?.refundedAmount ?? 0,
    };
  }

  /**
   * Динамика за несколько месяцев (C: отчёты клуба).
   *
   * Выручка и задолженность считаются по тем же правилам, что и сводка за один
   * месяц: деньги — по датам движений, долг — по расчётному месяцу. Иначе график
   * показывал бы другую картину, чем соседняя таблица.
   *
   * Ограничение в 12 месяцев: больше — это уже не «динамика», а выгрузка, для
   * которой есть CSV.
   */
  async dynamics(
    callerUserId: string,
    year: number,
    month: number,
    months: number,
  ): Promise<FinanceDynamics> {
    this.assertMonth(month);
    const count = Math.min(Math.max(Math.floor(months), 1), 12);
    const points: FinanceDynamicsPoint[] = [];

    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const cursor = new Date(Date.UTC(year, month - 1 - offset, 1));
      const pointYear = cursor.getUTCFullYear();
      const pointMonth = cursor.getUTCMonth() + 1;
      const next = new Date(Date.UTC(pointYear, pointMonth, 1));

      const [debtors, movements] = await Promise.all([
        this.listDebtors(callerUserId, pointYear, pointMonth),
        this.finance.listMovementsInRange(cursor, next),
      ]);

      let received = 0;
      let refunded = 0;
      for (const movement of movements) {
        if (movement.kind === PaymentKind.REFUND) {
          refunded += movement.amount;
        } else {
          received += movement.amount;
        }
      }

      const debtorRows = debtors.filter((row) => row.isDebtor);
      const withoutExpected = debtorRows.filter((row) => row.expectedAmount === null).length;

      // Сумма долга не считается, если есть должники без ожидаемой суммы:
      // сложить известные остатки значило бы скрыть неопределенность.
      const debt =
        withoutExpected > 0
          ? null
          : debtorRows.reduce(
              (sum, row) => sum + (Number(row.expectedAmount ?? 0) - row.paidAmount),
              0,
            );

      points.push({
        year: pointYear,
        month: pointMonth,
        received,
        refunded,
        revenue: received - refunded,
        debtors: debtorRows.length,
        debtorsWithoutExpected: withoutExpected,
        debt: debt === null ? null : Math.round(debt * 100) / 100,
      });
    }

    return { points };
  }

  /**
   * Выгрузка должников за месяц в CSV.
   *
   * Включаются все спортсмены месяца, а не только должники: бухгалтеру нужны и
   * освобожденные, чтобы вопрос «почему с этого не взяли» не возвращался.
   */
  async exportDebtorsCsv(
    callerUserId: string,
    year: number,
    month: number,
  ): Promise<{ filename: string; content: string }> {
    const debtors = await this.listDebtors(callerUserId, year, month);

    const rows: string[][] = [
      ['Спортсмен', 'Должник', 'Основание', 'Ожидается', 'Оплачено', 'Остаток'],
    ];

    for (const row of debtors) {
      const expected = row.expectedAmount === null ? '' : String(row.expectedAmount);
      const outstanding =
        row.expectedAmount === null ? '' : String(Number(row.expectedAmount) - row.paidAmount);

      rows.push([
        `${row.lastName} ${row.firstName}`.trim(),
        row.isDebtor ? 'да' : 'нет',
        row.reason ?? '',
        expected,
        String(row.paidAmount),
        outstanding,
      ]);
    }

    return {
      filename: `debtors-${year}-${String(month).padStart(2, '0')}.csv`,
      content: toCsv(rows),
    };
  }

  /** Выгрузка движений средств за период в CSV. */
  async exportPaymentsCsv(
    callerUserId: string,
    from: string,
    to: string,
  ): Promise<{ filename: string; content: string }> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Некорректный период: нужны даты в формате YYYY-MM-DD',
      );
    }
    if (fromDate >= toDate) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Начало периода должно быть раньше конца',
      );
    }

    // Право проверяет контроллер (payments.view): выгрузка — те же финансовые
    // данные, только в файле, и отдельного права на нее нет.
    const movements = await this.finance.listPaymentsForExport(fromDate, toDate);

    const rows: string[][] = [
      ['Дата', 'Тип', 'Спортсмен', 'Группа', 'Сумма', 'Способ', 'Комментарий'],
    ];

    for (const movement of movements) {
      rows.push([
        movement.paidAt.toISOString().slice(0, 10),
        movement.kind === PaymentKind.REFUND ? 'Возврат' : 'Поступление',
        `${movement.athleteLastName} ${movement.athleteFirstName}`.trim(),
        movement.groupName ?? '',
        String(movement.amount),
        movement.method ?? '',
        movement.note ?? '',
      ]);
    }

    return {
      filename: `payments-${from}-${to}.csv`,
      content: toCsv(rows),
    };
  }

  /**
   * Сводка финансов за месяц: деньги, задолженность и разбивка по филиалам.
   *
   * Два разных знаменателя считаются осознанно:
   *
   * - **выручка — по датам движений**: сколько денег прошло в этом месяце, включая
   *   оплаты за прошлые периоды;
   * - **задолженность — по расчетному месяцу**: долг за сентябрь остается
   *   сентябрьским, даже если его закрыли в октябре (BR-004).
   *
   * Зал берется у группы спортсмена; спортсмен без филиала попадает в
   * отдельную строку «Зал не назначен».
   */
  async summary(callerUserId: string, year: number, month: number): Promise<FinanceSummary> {
    this.assertMonth(month);

    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));

    const [debtors, movements, athletes, branches] = await Promise.all([
      this.listDebtors(callerUserId, year, month),
      this.finance.listMovementsInRange(from, to),
      this.finance.listActiveAthletes(),
      this.finance.listHalls(),
    ]);

    const totals = movements.reduce<FinanceTotals>(
      (acc, movement) => {
        if (movement.kind === PaymentKind.REFUND) {
          acc.refunded += movement.amount;
        } else {
          acc.received += movement.amount;
        }
        acc.revenue = acc.received - acc.refunded;
        return acc;
      },
      { received: 0, refunded: 0, revenue: 0 },
    );

    // Расходы на филиалы: выручка по филиалу движения, задолженность — по
    // филиалу спортсмена. Спортсмены без филиала сведены в одну строку.
    const debtorsOnly = debtors.filter((row) => row.isDebtor);
    const hallByAthlete = await this.finance.hallsForAthletes(
      debtorsOnly.map((row) => row.athleteId),
    );

    const byHall = new Map<string, HallFinanceSummary>();
    const ensureHall = (hallId: string | null, hallName: string): HallFinanceSummary => {
      const key = hallId ?? NO_HALL_KEY;
      const existing = byHall.get(key);
      if (existing) {
        return existing;
      }

      const created: HallFinanceSummary = {
        hallId,
        hallName,
        received: 0,
        refunded: 0,
        revenue: 0,
        debtors: 0,
        debt: 0,
      };
      byHall.set(key, created);
      return created;
    };

    // Залы заводятся заранее: движение по филиалу без должников тоже должно
    // попасть в сводку, иначе сравнение филиалов было бы неполным.
    for (const branch of branches) {
      ensureHall(branch.id, branch.name);
    }

    const hallNameById = new Map(branches.map((branch) => [branch.id, branch.name]));

    for (const movement of movements) {
      const hallId = movement.hallId;
      const row = ensureHall(
        hallId,
        hallId ? (hallNameById.get(hallId) ?? 'Зал удалён') : NO_HALL_NAME,
      );
      if (movement.kind === PaymentKind.REFUND) {
        row.refunded += movement.amount;
      } else {
        row.received += movement.amount;
      }
      row.revenue = row.received - row.refunded;
    }

    for (const debtor of debtorsOnly) {
      const branch = hallByAthlete.get(debtor.athleteId) ?? null;
      const row = ensureHall(branch?.hallId ?? null, branch?.hallName ?? NO_HALL_NAME);
      row.debtors += 1;
      row.debt += Math.max((debtor.expectedAmount ?? 0) - debtor.paidAmount, 0);
    }

    const expected = debtorsOnly.reduce((sum, row) => sum + (row.expectedAmount ?? 0), 0);
    const debt = debtorsOnly.reduce(
      (sum, row) => sum + Math.max((row.expectedAmount ?? 0) - row.paidAmount, 0),
      0,
    );

    return {
      year,
      month,
      totals,
      expected,
      debtors: debtorsOnly.length,
      debtorsWithoutExpected: debtorsOnly.filter((row) => row.expectedAmount === null).length,
      debt,
      activeAthletes: athletes.filter((athlete) => athlete.status === PrismaAthleteStatus.ACTIVE)
        .length,
      // Зал без движения и без должников не показывается: пустые строки
      // мешали бы сравнивать филиалы между собой.
      branches: [...byHall.values()]
        .filter((row) => row.received > 0 || row.refunded > 0 || row.debtors > 0)
        .sort((a, b) => b.revenue - a.revenue || a.hallName.localeCompare(b.hallName)),
    };
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
  /**
   * Пересчитывает зачтенную сумму и статус периода по фактическим движениям.
   *
   * ADR-0010: зачтено = поступления − возвраты. Обе величины пишутся вместе
   * (`paidAmount` и `refundedAmount`), поэтому разойтись не могут.
   *
   * Ручная отметка «оплачен полностью» имеет приоритет (BR-003): она ставится
   * именно тогда, когда сумма в системе не совпадает с реальностью.
   */
  private async recalculate(period: MembershipPeriodRecord): Promise<MembershipPeriodRecord> {
    const [payments, refunds] = await Promise.all([
      this.finance.sumPayments(period.id),
      this.finance.sumRefunds(period.id),
    ]);

    const paidAmount = payments - refunds;
    const status = deriveStatus({
      fullyPaidMarked: period.fullyPaidMarkedAt !== null,
      paidAmount,
      expectedAmount: period.expectedAmount,
    });

    if (
      paidAmount === period.paidAmount &&
      refunds === period.refundedAmount &&
      status === period.status
    ) {
      return period;
    }

    return this.finance.refreshPeriodTotals(period.id, paidAmount, refunds, status);
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

  /** Возврат ищется явно: `REFUND_NOT_FOUND` точнее, чем «оплата не найдена». */
  private async requireRefund(refundId: string): Promise<PaymentRecord> {
    const refund = await this.finance.findPayment(refundId);
    if (!refund || refund.kind !== PaymentKind.REFUND) {
      throw new ApiException('REFUND_NOT_FOUND' satisfies ApiErrorCode, 'Возврат не найден');
    }
    return refund;
  }
}

/**
 * Залы в сводке: у спортсмена без группы или без филиала своя строка.
 *
 * Ключ не пересекается с UUID филиалов, поэтому «без филиала» не может слиться с
 * настоящим филиалом.
 */
const NO_HALL_KEY = '__no_branch__';
const NO_HALL_NAME = 'Зал не назначен';

/** Статус периода выводится из движений и ручной отметки, а не вводится руками.
 *
 * ADR-0010: `paidAmount` здесь — уже нетто (поступления минус возвраты), поэтому
 * полный возврат возвращает период в `UNPAID`, а не оставляет его оплаченным.
 */
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
    kind: payment.kind as PaymentKind,
    amount: payment.amount,
    method: payment.method as PaymentMethod,
    paidAt: toCalendarDate(payment.paidAt),
    comment: payment.comment,
    refundedPaymentId: payment.refundedPaymentId,
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
    // Зачтено (нетто): поступления минус возвраты (ADR-0010).
    paidAmount: period.paidAmount,
    refundedAmount: period.refundedAmount,
    status: period.status,
    fullyPaidMarkedAt: period.fullyPaidMarkedAt?.toISOString() ?? null,
    fullyPaidMarkedById: period.fullyPaidMarkedById,
    note: period.note,
    payments: period.payments.map(toPaymentView),
  };
}

/**
 * Суммарная задолженность по списку решений.
 *
 * `null`, если хотя бы у одного должника не задана ожидаемая сумма: сложить
 * известные остатки и показать меньшее число значило бы скрыть неопределенность.
 */
function sumOutstanding(entries: Array<{ decision: { isDebtor: boolean; outstanding: number | null } }>): number | null {
  let total = 0;

  for (const entry of entries) {
    if (!entry.decision.isDebtor) {
      continue;
    }
    if (entry.decision.outstanding === null) {
      return null;
    }
    total += entry.decision.outstanding;
  }

  return Math.round(total * 100) / 100;
}
/**
 * CSV для Excel: точка с запятой как разделитель и BOM.
 *
 * Русская локаль Excel ждет `;`, а не `,`; BOM нужен, чтобы кириллица не
 * превратилась в кракозябры при двойном клике по файлу.
 */
function toCsv(rows: string[][]): string {
  // `escape` — имя глобальной функции; локальная переменная перекрыла бы её и
  // сбивала бы читателя.
  const escapeCell = (value: string): string =>
    /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  return `\uFEFF${rows.map((row) => row.map(escapeCell).join(';')).join('\r\n')}\r\n`;
}
/** Дата срока в ISO: `YYYY-MM-DD` для дня месяца. */
function formatDueDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Прошел ли срок.
 *
 * Сравнение с концом дня срока: в день оплаты еще можно платить без просрочки,
 * иначе утром 10-го родитель уже видел бы «просрочено».
 */
function isDueDatePassed(dueDate: string, now = new Date()): boolean {
  const deadline = new Date(`${dueDate}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000;
  return now.getTime() >= deadline;
}