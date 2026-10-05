import { AuditService } from '../audit/audit.service';
import type { FreezeRepository } from '../freezes/freezes.repository';
import { ResourceScopeService } from '../identity/resource-scope.service';
import type { FinanceRepository, MembershipPeriodRecord } from './finance.repository';
import { FinanceService } from './finance.service';

const period: MembershipPeriodRecord = {
  id: 'period-1',
  athleteId: 'athlete-1',
  year: 2026,
  month: 10,
  expectedAmount: 25000,
  paidAmount: 0,
  status: 'UNPAID',
  fullyPaidMarkedAt: null,
  fullyPaidMarkedById: null,
  note: null,
  payments: [],
};

describe('FinanceService', () => {
  let repository: jest.Mocked<FinanceRepository>;
  let freezes: { listFrozenAthleteIds: jest.Mock };
  let scope: { assertAthleteAccess: jest.Mock };
  let audit: { recordSafely: jest.Mock };
  let service: FinanceService;

  beforeEach(() => {
    repository = {
      findPeriod: jest.fn().mockResolvedValue(period),
      findPeriodById: jest.fn().mockResolvedValue(period),
      createPeriod: jest.fn().mockResolvedValue(period),
      refreshPeriodTotals: jest
        .fn()
        .mockImplementation((id: string, paidAmount: number, status: string) =>
          Promise.resolve({ ...period, paidAmount, status }),
        ),
      updatePeriod: jest.fn().mockResolvedValue(period),
      setFullyPaidMark: jest
        .fn()
        .mockImplementation((id: string, markedAt: Date | null) =>
          Promise.resolve({ ...period, fullyPaidMarkedAt: markedAt }),
        ),
      listPeriodsForMonth: jest.fn().mockResolvedValue([]),
      createPayment: jest.fn().mockResolvedValue({
        id: 'payment-1',
        periodId: 'period-1',
        amount: 25000,
        method: 'CASH',
        paidAt: new Date('2026-10-05T00:00:00.000Z'),
        comment: null,
        createdById: 'admin-1',
        createdAt: new Date('2026-10-05T10:00:00.000Z'),
      }),
      findPaymentByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findPayment: jest.fn(),
      updatePayment: jest.fn(),
      deletePayment: jest.fn().mockResolvedValue(true),
      sumPayments: jest.fn().mockResolvedValue(0),
      findAthlete: jest.fn().mockResolvedValue({
        id: 'athlete-1',
        firstName: 'Али',
        lastName: 'Серик',
      }),
      listActiveAthletes: jest.fn().mockResolvedValue([
        { athleteId: 'athlete-1', firstName: 'Али', lastName: 'Серик', status: 'ACTIVE' },
      ]),
      athleteIdsWithMembershipInMonth: jest
        .fn()
        .mockResolvedValue([
          { athleteId: 'athlete-1', joinedAt: new Date('2026-09-01'), leftAt: null },
        ]),
      hasGroupTrainingInMonth: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<FinanceRepository>;

    freezes = { listFrozenAthleteIds: jest.fn().mockResolvedValue([]) };
    scope = { assertAthleteAccess: jest.fn().mockResolvedValue({ allowed: true }) };
    audit = { recordSafely: jest.fn().mockResolvedValue(null) };

    service = new FinanceService(
      repository,
      freezes as unknown as FreezeRepository,
      scope as unknown as ResourceScopeService,
      audit as unknown as AuditService,
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

      expect(repository.refreshPeriodTotals).toHaveBeenCalledWith('period-1', 0, 'UNPAID');
    });

    it('частичная оплата дает статус PARTIALLY_PAID', async () => {
      repository.sumPayments.mockResolvedValue(10000);

      await service.getPeriod('admin-1', 'athlete-1', 2026, 10);

      expect(repository.refreshPeriodTotals).toHaveBeenCalledWith(
        'period-1',
        10000,
        'PARTIALLY_PAID',
      );
    });

    it('полная оплата дает статус PAID', async () => {
      repository.sumPayments.mockResolvedValue(25000);

      await service.getPeriod('admin-1', 'athlete-1', 2026, 10);

      expect(repository.refreshPeriodTotals).toHaveBeenCalledWith('period-1', 25000, 'PAID');
    });

    it('без заданной ожидаемой суммы оплата считается полной', async () => {
      repository.findPeriod.mockResolvedValue({ ...period, expectedAmount: null });
      repository.sumPayments.mockResolvedValue(5000);

      await service.getPeriod('admin-1', 'athlete-1', 2026, 10);

      expect(repository.refreshPeriodTotals).toHaveBeenCalledWith('period-1', 5000, 'PAID');
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

      await service.setFullyPaid('admin-1', 'period-1', true);

      expect(repository.setFullyPaidMark).toHaveBeenCalledWith(
        'period-1',
        expect.any(Date),
        'admin-1',
      );
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
      repository.findPaymentByIdempotencyKey.mockResolvedValue({
        id: 'payment-1',
        periodId: 'period-1',
        amount: 25000,
        method: 'CASH',
        paidAt: new Date(),
        comment: null,
        createdById: 'admin-1',
        createdAt: new Date(),
      });

      await service.recordPayment('admin-1', 'period-1', {
        amount: 25000,
        idempotencyKey: 'key-1',
      });

      expect(repository.createPayment).not.toHaveBeenCalled();
    });

    it('отменяет оплату и пересчитывает период', async () => {
      repository.findPayment.mockResolvedValue({
        id: 'payment-1',
        periodId: 'period-1',
        amount: 25000,
        method: 'CASH',
        paidAt: new Date(),
        comment: null,
        createdById: 'admin-1',
        createdAt: new Date(),
      });

      await service.voidPayment('admin-1', 'payment-1');

      expect(repository.deletePayment).toHaveBeenCalledWith('payment-1');
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'finance.payment_voided' }),
      );
    });

    it('отдает 404 для неизвестной оплаты', async () => {
      repository.findPayment.mockResolvedValue(null);

      await expect(service.voidPayment('admin-1', 'missing')).rejects.toMatchObject({
        code: 'PAYMENT_NOT_FOUND',
      });
    });
  });

  describe('задолженность (BR-004)', () => {
    it('активный спортсмен без оплаты и с тренировками — должник', async () => {
      const debtors = await service.listDebtors('admin-1', 2026, 10);

      expect(debtors).toHaveLength(1);
      expect(debtors[0]).toMatchObject({ athleteId: 'athlete-1', isDebtor: true, reason: null });
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
});
