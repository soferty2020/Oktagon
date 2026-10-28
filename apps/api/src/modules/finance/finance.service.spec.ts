import { DEFAULT_DEBT_RULES } from '@octagon/contracts';

import { AuditService } from '../audit/audit.service';
import type { FreezeRepository } from '../freezes/freezes.repository';
import { ResourceScopeService } from '../identity/resource-scope.service';
import { DebtRulesService } from '../settings/debt-rules.service';
import { SettingsService } from '../settings/settings.service';
import type {
  FinanceRepository,
  MembershipPeriodRecord,
  PaymentRecord,
} from './finance.repository';
import { FinanceService } from './finance.service';

const period: MembershipPeriodRecord = {
  id: 'period-1',
  athleteId: 'athlete-1',
  year: 2026,
  month: 10,
  expectedAmount: 25000,
  paidAmount: 0,
  refundedAmount: 0,
  status: 'UNPAID',
  fullyPaidMarkedAt: null,
  fullyPaidMarkedById: null,
  note: null,
  payments: [],
};

/** Поступление: направление задается явно (ADR-0010). */
const payment: PaymentRecord = {
  id: 'payment-1',
  periodId: 'period-1',
  kind: 'PAYMENT',
  amount: 25000,
  method: 'CASH',
  paidAt: new Date('2026-10-05T00:00:00.000Z'),
  comment: null,
  refundedPaymentId: null,
  createdById: 'admin-1',
  createdAt: new Date('2026-10-05T10:00:00.000Z'),
};

/** Возврат, привязанный к поступлению. */
const refund: PaymentRecord = {
  id: 'refund-1',
  periodId: 'period-1',
  kind: 'REFUND',
  amount: 10000,
  method: 'CASH',
  paidAt: new Date('2026-10-06T00:00:00.000Z'),
  comment: 'Спортсмен ушел из клуба',
  refundedPaymentId: 'payment-1',
  createdById: 'admin-1',
  createdAt: new Date('2026-10-06T10:00:00.000Z'),
};

describe('FinanceService', () => {
  let repository: jest.Mocked<FinanceRepository>;
  let freezes: { listFrozenAthleteIds: jest.Mock };
  let scope: { assertAthleteAccess: jest.Mock; visibleAthleteIds: jest.Mock };
  let audit: { recordSafely: jest.Mock };
  let debtRules: { getConfigForDate: jest.Mock };
  let settings: { getClubProfile: jest.Mock };
  let service: FinanceService;

  beforeEach(() => {
    repository = {
      findPeriod: jest.fn().mockResolvedValue(period),
      findPeriodById: jest.fn().mockResolvedValue(period),
      createPeriod: jest.fn().mockResolvedValue(period),
      refreshPeriodTotals: jest
        .fn()
        .mockImplementation(
          (id: string, paidAmount: number, refundedAmount: number, status: string) =>
            Promise.resolve({ ...period, paidAmount, refundedAmount, status }),
        ),
      updatePeriod: jest.fn().mockResolvedValue(period),
      setFullyPaidMark: jest
        .fn()
        .mockImplementation((id: string, markedAt: Date | null) =>
          Promise.resolve({ ...period, fullyPaidMarkedAt: markedAt }),
        ),
      listPeriodsForMonth: jest.fn().mockResolvedValue([]),
      createPayment: jest.fn().mockResolvedValue(payment),
      findPaymentByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findPayment: jest.fn(),
      updatePayment: jest.fn(),
      deletePayment: jest.fn().mockResolvedValue(true),
      sumPayments: jest.fn().mockResolvedValue(0),
      sumRefunds: jest.fn().mockResolvedValue(0),
      createRefund: jest.fn().mockResolvedValue(refund),
      deleteRefund: jest.fn().mockResolvedValue(true),
      findRefundsByPayment: jest.fn().mockResolvedValue([]),
      countRefundsByPayment: jest.fn().mockResolvedValue(0),
      findAthlete: jest.fn().mockResolvedValue({
        id: 'athlete-1',
        firstName: 'Али',
        lastName: 'Серик',
      }),
      listActiveAthletes: jest
        .fn()
        .mockResolvedValue([
          { athleteId: 'athlete-1', firstName: 'Али', lastName: 'Серик', status: 'ACTIVE' },
        ]),
      athleteIdsWithMembershipInMonth: jest
        .fn()
        .mockResolvedValue([
          { athleteId: 'athlete-1', joinedAt: new Date('2026-09-01'), leftAt: null },
        ]),
      hasGroupTrainingInMonth: jest.fn().mockResolvedValue(true),
      listMovementsInRange: jest.fn().mockResolvedValue([]),
      hallsForAthletes: jest.fn().mockResolvedValue(new Map()),
      listHalls: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<FinanceRepository>;

    freezes = { listFrozenAthleteIds: jest.fn().mockResolvedValue([]) };
    scope = {
    assertAthleteAccess: jest.fn().mockResolvedValue({ allowed: true }),
    // По умолчанию ограничений нет: тесты финансов не про зону доступа.
    visibleAthleteIds: jest.fn().mockResolvedValue(null),
  };
    audit = { recordSafely: jest.fn().mockResolvedValue(null) };
    // Правила долга по умолчанию — BR-004: существующие тесты должны проходить
    // без изменений, это и есть проверка отсутствия регрессии (K5).
    debtRules = {
      getConfigForDate: jest.fn().mockResolvedValue(DEFAULT_DEBT_RULES),
    };
    // Срок оплаты по умолчанию не задан: сообщения без даты.
    settings = { getClubProfile: jest.fn().mockResolvedValue({ paymentDueDay: null }) };

    service = new FinanceService(
      repository,
      freezes as unknown as FreezeRepository,
      scope as unknown as ResourceScopeService,
      audit as unknown as AuditService,
      debtRules as unknown as DebtRulesService,
      settings as unknown as SettingsService,
    );
  });

  describe('расчетный период', () => {
    it('создает период при первом обращении', async () => {
      repository.findPeriod.mockResolvedValue(null);

      const view = await service.getPeriod('admin-1', 'athlete-1', 2026, 10);

      expect(repository.createPeriod).toHaveBeenCalledWith({
        athleteId: 'athlete-1',
        year: 2026,
        month: 10,
      });
      expect(view.month).toBe(10);
    });

    it('проверяет доступ к спортсмену', async () => {
      await service.getPeriod('admin-1', 'athlete-1', 2026, 10);

      expect(scope.assertAthleteAccess).toHaveBeenCalledWith('admin-1', 'athlete-1');
    });

    it('отклоняет некорректный месяц', async () => {
      await expect(service.getPeriod('admin-1', 'athlete-1', 2026, 13)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    });

    it('отдает 404 для неизвестного периода', async () => {
      repository.findPeriodById.mockResolvedValue(null);

      await expect(service.updatePeriod('admin-1', 'missing', {})).rejects.toMatchObject({
        code: 'MEMBERSHIP_PERIOD_NOT_FOUND',
      });
    });
  });

  describe('статус периода выводится из оплат', () => {
    it('без оплат период не оплачен', async () => {
      // Период начинается с нулевой суммы и статуса UNPAID, поэтому проверяется
      // случай после отмены оплаты: сумма в базе есть, а фактических оплат нет.
      repository.findPeriod.mockResolvedValue({ ...period, paidAmount: 25000, status: 'PAID' });
      repository.sumPayments.mockResolvedValue(0);

      await service.getPeriod('admin-1', 'athlete-1', 2026, 10);

      expect(repository.refreshPeriodTotals).toHaveBeenCalledWith('period-1', 0, 0, 'UNPAID');
    });

    it('частичная оплата дает статус PARTIALLY_PAID', async () => {
      repository.sumPayments.mockResolvedValue(10000);

      await service.getPeriod('admin-1', 'athlete-1', 2026, 10);

      expect(repository.refreshPeriodTotals).toHaveBeenCalledWith(
        'period-1',
        10000,
        0,
        'PARTIALLY_PAID',
      );
    });

    it('полная оплата дает статус PAID', async () => {
      repository.sumPayments.mockResolvedValue(25000);

      await service.getPeriod('admin-1', 'athlete-1', 2026, 10);

      expect(repository.refreshPeriodTotals).toHaveBeenCalledWith('period-1', 25000, 0, 'PAID');
    });

    it('без заданной ожидаемой суммы оплата считается полной', async () => {
      repository.findPeriod.mockResolvedValue({ ...period, expectedAmount: null });
      repository.sumPayments.mockResolvedValue(5000);

      await service.getPeriod('admin-1', 'athlete-1', 2026, 10);

      expect(repository.refreshPeriodTotals).toHaveBeenCalledWith('period-1', 5000, 0, 'PAID');
    });

    it('не трогает базу, если сумма и статус не изменились', async () => {
      repository.findPeriod.mockResolvedValue({ ...period, paidAmount: 25000, status: 'PAID' });
      repository.sumPayments.mockResolvedValue(25000);

      await service.getPeriod('admin-1', 'athlete-1', 2026, 10);

      expect(repository.refreshPeriodTotals).not.toHaveBeenCalled();
    });
  });

  describe('ручная отметка «оплачен полностью» (BR-003)', () => {
    it('ставит отметку и статус независимо от суммы', async () => {
      repository.sumPayments.mockResolvedValue(0);

      const view = await service.setFullyPaid('admin-1', 'period-1', true);

      expect(repository.setFullyPaidMark).toHaveBeenCalledWith(
        'period-1',
        expect.any(Date),
        'admin-1',
      );
      // Отметка меняет только свое поле, поэтому статус обязан пересчитаться:
      // иначе период остался бы «не оплачен» при отметке «оплачен полностью».
      expect(view.status).toBe('FULLY_PAID_MARKED');
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'finance.period_marked_fully_paid' }),
      );
    });

    it('снимает отметку', async () => {
      await service.setFullyPaid('admin-1', 'period-1', false);

      expect(repository.setFullyPaidMark).toHaveBeenCalledWith('period-1', null, null);
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'finance.period_fully_paid_unmarked' }),
      );
    });

    it('отметка имеет приоритет над суммой при пересчете', async () => {
      repository.findPeriod.mockResolvedValue({
        ...period,
        fullyPaidMarkedAt: new Date('2026-10-01'),
      });
      repository.sumPayments.mockResolvedValue(0);

      await service.getPeriod('admin-1', 'athlete-1', 2026, 10);

      expect(repository.refreshPeriodTotals).toHaveBeenCalledWith(
        'period-1',
        0,
        0,
        'FULLY_PAID_MARKED',
      );
    });
  });

  describe('оплаты (BR-002)', () => {
    it('вносит произвольную сумму и пересчитывает период', async () => {
      repository.sumPayments.mockResolvedValue(25000);

      const view = await service.recordPayment('admin-1', 'period-1', { amount: 25000 });

      expect(repository.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ periodId: 'period-1', amount: 25000, createdById: 'admin-1' }),
      );
      expect(view.status).toBe('PAID');
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'finance.payment_recorded' }),
      );
    });

    it('отклоняет нулевую и отрицательную сумму', async () => {
      await expect(
        service.recordPayment('admin-1', 'period-1', { amount: 0 }),
      ).rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_INVALID' });
      await expect(
        service.recordPayment('admin-1', 'period-1', { amount: -100 }),
      ).rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_INVALID' });
      expect(repository.createPayment).not.toHaveBeenCalled();
    });

    it('повторная отправка с тем же ключом не создает вторую оплату', async () => {
      repository.findPaymentByIdempotencyKey.mockResolvedValue(payment);

      await service.recordPayment('admin-1', 'period-1', {
        amount: 25000,
        idempotencyKey: 'key-1',
      });

      expect(repository.createPayment).not.toHaveBeenCalled();
    });

    it('отменяет оплату и пересчитывает период', async () => {
      repository.findPayment.mockResolvedValue(payment);

      await service.voidPayment('admin-1', 'payment-1');

      expect(repository.deletePayment).toHaveBeenCalledWith('payment-1');
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'finance.payment_voided' }),
      );
    });

    it('не удаляет оплату, по которой есть возвраты (ADR-0010)', async () => {
      repository.findPayment.mockResolvedValue(payment);
      repository.countRefundsByPayment.mockResolvedValue(1);

      await expect(service.voidPayment('admin-1', 'payment-1')).rejects.toMatchObject({
        code: 'PAYMENT_HAS_REFUNDS',
      });
      expect(repository.deletePayment).not.toHaveBeenCalled();
    });

    it('не дает изменить возврат через изменение оплаты', async () => {
      repository.findPayment.mockResolvedValue(refund);

      await expect(
        service.updatePayment('admin-1', 'refund-1', { amount: 5000 }),
      ).rejects.toMatchObject({ code: 'REFUND_PAYMENT_MISMATCH' });
      expect(repository.updatePayment).not.toHaveBeenCalled();
    });

    it('отдает 404 для неизвестной оплаты', async () => {
      repository.findPayment.mockResolvedValue(null);

      await expect(service.voidPayment('admin-1', 'missing')).rejects.toMatchObject({
        code: 'PAYMENT_NOT_FOUND',
      });
    });
  });

  describe('возвраты (ADR-0010)', () => {
    it('оформляет возврат и пересчитывает период по нетто', async () => {
      repository.findPayment.mockResolvedValue(payment);
      repository.sumPayments.mockResolvedValue(25000);
      repository.sumRefunds.mockResolvedValue(10000);

      const view = await service.refundPayment('admin-1', 'period-1', {
        amount: 10000,
        paymentId: 'payment-1',
      });

      expect(repository.createRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          periodId: 'period-1',
          amount: 10000,
          refundedPaymentId: 'payment-1',
          createdById: 'admin-1',
        }),
      );
      // Зачтено = поступления − возвраты: 25000 − 10000.
      expect(view.paidAmount).toBe(15000);
      expect(view.refundedAmount).toBe(10000);
      expect(view.status).toBe('PARTIALLY_PAID');
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'finance.payment_refunded' }),
      );
    });

    it('полный возврат возвращает период в UNPAID', async () => {
      repository.findPayment.mockResolvedValue(payment);
      repository.sumPayments.mockResolvedValue(25000);
      // Первый вызов — проверка лимита до записи возврата, второй — пересчет
      // после нее: возвращена вся сумма, поэтому зачтено становится нулем.
      repository.sumRefunds.mockResolvedValueOnce(0).mockResolvedValue(25000);

      const view = await service.refundPayment('admin-1', 'period-1', {
        amount: 25000,
        paymentId: 'payment-1',
      });

      expect(view.paidAmount).toBe(0);
      expect(view.refundedAmount).toBe(25000);
      expect(view.status).toBe('UNPAID');
    });

    it('позволяет возврат без привязки к поступлению', async () => {
      repository.sumPayments.mockResolvedValue(25000);
      repository.sumRefunds.mockResolvedValue(0);

      await service.refundPayment('admin-1', 'period-1', { amount: 5000 });

      expect(repository.createRefund).toHaveBeenCalledWith(
        expect.objectContaining({ refundedPaymentId: null, amount: 5000 }),
      );
    });

    it('отклоняет нулевую и отрицательную сумму возврата', async () => {
      await expect(
        service.refundPayment('admin-1', 'period-1', { amount: 0 }),
      ).rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_INVALID' });
      await expect(
        service.refundPayment('admin-1', 'period-1', { amount: -1 }),
      ).rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_INVALID' });
      expect(repository.createRefund).not.toHaveBeenCalled();
    });

    it('не возвращает больше, чем поступило по оплате', async () => {
      repository.findPayment.mockResolvedValue(payment);
      repository.findRefundsByPayment.mockResolvedValue([refund]);

      await expect(
        service.refundPayment('admin-1', 'period-1', { amount: 20000, paymentId: 'payment-1' }),
      ).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_PAYMENT' });
      expect(repository.createRefund).not.toHaveBeenCalled();
    });

    it('не возвращает больше, чем поступило по периоду', async () => {
      repository.sumPayments.mockResolvedValue(25000);
      repository.sumRefunds.mockResolvedValue(20000);

      await expect(
        service.refundPayment('admin-1', 'period-1', { amount: 10000 }),
      ).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_PAYMENT' });
      expect(repository.createRefund).not.toHaveBeenCalled();
    });

    it('отклоняет возврат по оплате другого периода', async () => {
      repository.findPayment.mockResolvedValue({ ...payment, periodId: 'period-2' });

      await expect(
        service.refundPayment('admin-1', 'period-1', { amount: 1000, paymentId: 'payment-1' }),
      ).rejects.toMatchObject({ code: 'REFUND_PAYMENT_MISMATCH' });
    });

    it('не привязывает возврат к другому возврату', async () => {
      repository.findPayment.mockResolvedValue(refund);

      await expect(
        service.refundPayment('admin-1', 'period-1', { amount: 1000, paymentId: 'refund-1' }),
      ).rejects.toMatchObject({ code: 'REFUND_PAYMENT_MISMATCH' });
    });

    it('повторная отправка с тем же ключом не создает второй возврат', async () => {
      repository.findPaymentByIdempotencyKey.mockResolvedValue(refund);

      await service.refundPayment('admin-1', 'period-1', {
        amount: 10000,
        idempotencyKey: 'key-1',
      });

      expect(repository.createRefund).not.toHaveBeenCalled();
    });

    it('отменяет возврат и пересчитывает период', async () => {
      repository.findPayment.mockResolvedValue(refund);

      await service.voidRefund('admin-1', 'refund-1');

      expect(repository.deleteRefund).toHaveBeenCalledWith('refund-1');
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'finance.payment_refund_voided' }),
      );
    });

    it('отдает 404 для неизвестного возврата', async () => {
      repository.findPayment.mockResolvedValue(null);

      await expect(service.voidRefund('admin-1', 'missing')).rejects.toMatchObject({
        code: 'REFUND_NOT_FOUND',
      });
    });

    it('не отменяет возврат по чужому идентификатору оплаты', async () => {
      repository.findPayment.mockResolvedValue(payment);

      await expect(service.voidRefund('admin-1', 'payment-1')).rejects.toMatchObject({
        code: 'REFUND_NOT_FOUND',
      });
      expect(repository.deleteRefund).not.toHaveBeenCalled();
    });
  });

  describe('задолженность (BR-004)', () => {
    it('активный спортсмен без оплаты и с тренировками — должник', async () => {
      const debtors = await service.listDebtors('admin-1', 2026, 10);

      expect(debtors).toHaveLength(1);
      expect(debtors[0]).toMatchObject({ athleteId: 'athlete-1', isDebtor: true, reason: null });
    });

    it('внесена вся ожидаемая сумма — спортсмен не должник', async () => {
      // Найдено сквозным сценарием приемки: при зачтенном, равном ожидаемому,
      // спортсмен оставался в списке должников, и клуб требовал бы деньги с уже
      // оплатившего. Правило BR-004 перечисляет четыре условия, но «должен»
      // означает еще и недоплату.
      repository.listPeriodsForMonth.mockResolvedValue([
        { ...period, expectedAmount: 25000, paidAmount: 25000 },
      ]);

      const debtors = await service.listDebtors('admin-1', 2026, 10);

      expect(debtors[0]).toMatchObject({
        isDebtor: false,
        expectedAmount: 25000,
        paidAmount: 25000,
      });
    });

    it('частичная оплата оставляет должником', async () => {
      repository.listPeriodsForMonth.mockResolvedValue([
        { ...period, expectedAmount: 25000, paidAmount: 15000 },
      ]);

      const debtors = await service.listDebtors('admin-1', 2026, 10);

      expect(debtors[0]).toMatchObject({ isDebtor: true, paidAmount: 15000 });
    });

    it('возврат денег возвращает спортсмена в должники (ADR-0010)', async () => {
      // `paidAmount` хранится нетто: после возврата 10000 из внесенных 25000
      // зачтено 15000, и задолженность снова появляется.
      repository.listPeriodsForMonth.mockResolvedValue([
        { ...period, expectedAmount: 25000, paidAmount: 15000, refundedAmount: 10000 },
      ]);

      const debtors = await service.listDebtors('admin-1', 2026, 10);

      expect(debtors[0]).toMatchObject({
        isDebtor: true,
        paidAmount: 15000,
        refundedAmount: 10000,
      });
    });

    it('отметка «оплачен полностью» снимает задолженность', async () => {
      repository.listPeriodsForMonth.mockResolvedValue([
        { ...period, fullyPaidMarkedAt: new Date('2026-10-01') },
      ]);

      const debtors = await service.listDebtors('admin-1', 2026, 10);

      expect(debtors[0]).toMatchObject({ isDebtor: false, reason: 'MARKED_FULLY_PAID' });
    });

    it('заморозка снимает задолженность', async () => {
      freezes.listFrozenAthleteIds.mockResolvedValue(['athlete-1']);

      const debtors = await service.listDebtors('admin-1', 2026, 10);

      expect(debtors[0]).toMatchObject({ isDebtor: false, reason: 'FROZEN' });
    });

    it('без тренировок в месяце задолженности нет', async () => {
      repository.hasGroupTrainingInMonth.mockResolvedValue(false);

      const debtors = await service.listDebtors('admin-1', 2026, 10);

      expect(debtors[0]).toMatchObject({ isDebtor: false, reason: 'NO_TRAININGS_YET' });
    });

    it('неактивный спортсмен в список не попадает', async () => {
      repository.listActiveAthletes.mockResolvedValue([
        { athleteId: 'athlete-1', firstName: 'Али', lastName: 'Серик', status: 'ARCHIVED' },
      ]);

      await expect(service.listDebtors('admin-1', 2026, 10)).resolves.toEqual([]);
    });

    it('спортсмен без членства в месяце в список не попадает', async () => {
      repository.athleteIdsWithMembershipInMonth.mockResolvedValue([]);

      await expect(service.listDebtors('admin-1', 2026, 10)).resolves.toEqual([]);
    });

    it('должники идут первыми', async () => {
      repository.listActiveAthletes.mockResolvedValue([
        { athleteId: 'athlete-1', firstName: 'Али', lastName: 'Яковлев', status: 'ACTIVE' },
        { athleteId: 'athlete-2', firstName: 'Берик', lastName: 'Абрамов', status: 'ACTIVE' },
      ]);
      repository.athleteIdsWithMembershipInMonth.mockResolvedValue([
        { athleteId: 'athlete-1', joinedAt: new Date('2026-09-01'), leftAt: null },
        { athleteId: 'athlete-2', joinedAt: new Date('2026-09-01'), leftAt: null },
      ]);
      freezes.listFrozenAthleteIds.mockResolvedValue(['athlete-2']);

      const debtors = await service.listDebtors('admin-1', 2026, 10);

      expect(debtors[0]?.athleteId).toBe('athlete-1');
      expect(debtors[0]?.isDebtor).toBe(true);
    });
  });

  describe('сводка за месяц (F8)', () => {
    it('выручка считается по датам движений, возвраты вычитаются', async () => {
      repository.listMovementsInRange.mockResolvedValue([
        { kind: 'PAYMENT', athleteId: 'athlete-1', amount: 25000, hallId: null },
        { kind: 'PAYMENT', athleteId: 'athlete-1', amount: 10000, hallId: null },
        { kind: 'REFUND', athleteId: 'athlete-1', amount: 5000, hallId: null },
      ]);

      const summary = await service.summary('admin-1', 2026, 10);

      expect(summary.totals).toEqual({ received: 35000, refunded: 5000, revenue: 30000 });
    });

    it('считает задолженность и ожидания по должникам', async () => {
      repository.listPeriodsForMonth.mockResolvedValue([
        { ...period, expectedAmount: 25000, paidAmount: 10000 },
      ]);

      const summary = await service.summary('admin-1', 2026, 10);

      expect(summary.debtors).toBe(1);
      expect(summary.debt).toBe(15000);
      expect(summary.expected).toBe(25000);
      expect(summary.debtorsWithoutExpected).toBe(0);
    });

    it('выделяет должников без заданной ожидаемой суммы', async () => {
      // Ожидание не задано: долг посчитать нельзя, и «нет долга» здесь означает
      // незаполненное ожидание, а не оплату.
      repository.listPeriodsForMonth.mockResolvedValue([]);

      const summary = await service.summary('admin-1', 2026, 10);

      expect(summary.debtors).toBe(1);
      expect(summary.debtorsWithoutExpected).toBe(1);
      expect(summary.debt).toBe(0);
    });

    it('раскладывает выручку и долг по филиалам', async () => {
      repository.listHalls.mockResolvedValue([
        { id: 'branch-1', name: 'Центр' },
        { id: 'branch-2', name: 'Север' },
      ]);
      repository.listMovementsInRange.mockResolvedValue([
        { kind: 'PAYMENT', athleteId: 'athlete-1', amount: 20000, hallId: 'branch-1' },
        { kind: 'PAYMENT', athleteId: 'athlete-2', amount: 5000, hallId: 'branch-2' },
      ]);
      repository.listPeriodsForMonth.mockResolvedValue([
        { ...period, expectedAmount: 25000, paidAmount: 0 },
      ]);
      repository.hallsForAthletes.mockResolvedValue(
        new Map([['athlete-1', { hallId: 'branch-1', hallName: 'Центр' }]]),
      );

      const summary = await service.summary('admin-1', 2026, 10);
      const center = summary.branches.find((branch) => branch.hallId === 'branch-1');
      const north = summary.branches.find((branch) => branch.hallId === 'branch-2');

      expect(center).toMatchObject({ received: 20000, debtors: 1, debt: 25000 });
      expect(north).toMatchObject({ received: 5000, debtors: 0, debt: 0 });
      // Зал с движением, но без должников, остается в сводке: иначе
      // сравнение филиалов было бы неполным.
      expect(summary.branches).toHaveLength(2);
      expect(summary.branches[0]?.hallId).toBe('branch-1');
    });

    it('спортсмен без филиала попадает в отдельную строку', async () => {
      repository.listPeriodsForMonth.mockResolvedValue([
        { ...period, expectedAmount: 25000, paidAmount: 0 },
      ]);
      repository.hallsForAthletes.mockResolvedValue(new Map());

      const summary = await service.summary('admin-1', 2026, 10);

      expect(summary.branches).toHaveLength(1);
      expect(summary.branches[0]).toMatchObject({
        hallId: null,
        hallName: 'Зал не назначен',
        debtors: 1,
      });
    });

    it('филиал без движения и долгов в сводку не попадает', async () => {
      repository.listHalls.mockResolvedValue([
        { id: 'branch-1', name: 'Центр' },
        { id: 'branch-2', name: 'Пустой' },
      ]);
      // Должников нет: месяц отмечен оплаченным, поэтому строк филиалов быть не
      // должно — пустые строки мешали бы сравнивать филиалы между собой.
      repository.listPeriodsForMonth.mockResolvedValue([
        { ...period, fullyPaidMarkedAt: new Date('2026-10-01') },
      ]);

      const summary = await service.summary('admin-1', 2026, 10);

      expect(summary.debtors).toBe(0);
      expect(summary.branches).toEqual([]);
    });

    it('считает активных спортсменов', async () => {
      repository.listActiveAthletes.mockResolvedValue([
        { athleteId: 'athlete-1', firstName: 'Али', lastName: 'Серик', status: 'ACTIVE' },
        { athleteId: 'athlete-2', firstName: 'Берик', lastName: 'Абрамов', status: 'ARCHIVED' },
      ]);

      const summary = await service.summary('admin-1', 2026, 10);

      expect(summary.activeAthletes).toBe(1);
    });

    it('отклоняет некорректный месяц', async () => {
      await expect(service.summary('admin-1', 2026, 0)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    });
  });
});

