import { DEFAULT_DEBT_RULES } from '@octagon/contracts';

import { AuditService } from '../audit/audit.service';
import type { FreezeRepository } from '../freezes/freezes.repository';
import { ResourceScopeService } from '../identity/resource-scope.service';
import { DebtRulesService } from '../settings/debt-rules.service';
import { SettingsService } from '../settings/settings.service';
import type { FinanceRepository } from './finance.repository';
import { FinanceService } from './finance.service';

/**
 * Статус оплаты для участника (B).
 *
 * Проверяется главное: суммы наружу не уходят, а статус различает «оплачено»,
 * «частично», «не внесено», «не требуется» и «уточните у администратора».
 */
describe('FinanceService: статус оплаты участника', () => {
  let repository: jest.Mocked<FinanceRepository>;
  let scope: { assertAthleteAccess: jest.Mock };
  let service: FinanceService;

  const period = (overrides: Record<string, unknown> = {}) => ({
    id: 'period-1',
    athleteId: 'athlete-1',
    year: 2026,
    month: 10,
    expectedAmount: 50000,
    paidAmount: 50000,
    refundedAmount: 0,
    status: 'PAID' as const,
    fullyPaidMarkedAt: null,
    fullyPaidMarkedById: null,
    note: null,
    payments: [],
    ...overrides,
  });

  beforeEach(() => {
    repository = {
      findPeriod: jest.fn().mockResolvedValue(period()),
      athleteIdsWithMembershipInMonth: jest
        .fn()
        .mockResolvedValue([{ athleteId: 'athlete-1', joinedAt: new Date('2026-09-01'), leftAt: null }]),
      listFrozenAthleteIds: jest.fn().mockResolvedValue([]),
      hasGroupTrainingInMonth: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<FinanceRepository>;

    const freezes = { listFrozenAthleteIds: jest.fn().mockResolvedValue([]) };
    scope = { assertAthleteAccess: jest.fn().mockResolvedValue({ allowed: true }) };
    const audit = { recordSafely: jest.fn().mockResolvedValue(null) };
    const debtRules = { getConfigForDate: jest.fn().mockResolvedValue(DEFAULT_DEBT_RULES) };
    const settings = { getClubProfile: jest.fn().mockResolvedValue({ paymentDueDay: null }) };

    service = new FinanceService(
      repository,
      freezes as unknown as FreezeRepository,
      scope as unknown as ResourceScopeService,
      audit as unknown as AuditService,
      debtRules as unknown as DebtRulesService,
      settings as unknown as SettingsService,
    );
  });

  it('оплачено: остатка нет', async () => {
    const status = await service.getAthletePaymentStatus('user-1', 'athlete-1', 2026, 10);

    expect(status.status).toBe('PAID');
    expect(status.message).toContain('внесена');
    expect(status).not.toHaveProperty('amount');
  });

  it('частично: деньги были, но остаток больше допуска', async () => {
    repository.findPeriod.mockResolvedValue(period({ paidAmount: 30000, status: 'PARTIALLY_PAID' }));

    const status = await service.getAthletePaymentStatus('user-1', 'athlete-1', 2026, 10);

    expect(status.status).toBe('PARTIAL');
    expect(status.message).toContain('частично');
  });

  it('не внесено: ничего не платили', async () => {
    repository.findPeriod.mockResolvedValue(period({ paidAmount: 0, status: 'UNPAID' }));

    const status = await service.getAthletePaymentStatus('user-1', 'athlete-1', 2026, 10);

    expect(status.status).toBe('NOT_PAID');
  });

  it('не требуется: заморозка', async () => {
    const freezes = { listFrozenAthleteIds: jest.fn().mockResolvedValue(['athlete-1']) };
    const audit = { recordSafely: jest.fn().mockResolvedValue(null) };
    const debtRules = { getConfigForDate: jest.fn().mockResolvedValue(DEFAULT_DEBT_RULES) };
    const settings = { getClubProfile: jest.fn().mockResolvedValue({ paymentDueDay: null }) };

    service = new FinanceService(
      repository,
      freezes as unknown as FreezeRepository,
      scope as unknown as ResourceScopeService,
      audit as unknown as AuditService,
      debtRules as unknown as DebtRulesService,
      settings as unknown as SettingsService,
    );
    repository.findPeriod.mockResolvedValue(period({ paidAmount: 0, status: 'UNPAID' }));

    const status = await service.getAthletePaymentStatus('user-1', 'athlete-1', 2026, 10);

    expect(status.status).toBe('NOT_REQUIRED');
  });

  it('не требуется: отметка «полностью оплачен»', async () => {
    repository.findPeriod.mockResolvedValue(
      period({ paidAmount: 0, fullyPaidMarkedAt: new Date('2026-10-01') }),
    );

    const status = await service.getAthletePaymentStatus('user-1', 'athlete-1', 2026, 10);

    expect(status.status).toBe('NOT_REQUIRED');
  });

  it('не требуется: нет членства в месяце', async () => {
    repository.athleteIdsWithMembershipInMonth.mockResolvedValue([]);

    const status = await service.getAthletePaymentStatus('user-1', 'athlete-1', 2026, 10);

    expect(status.status).toBe('NOT_REQUIRED');
  });

  it('уточните у администратора: ожидаемая сумма не задана', async () => {
    repository.findPeriod.mockResolvedValue(period({ expectedAmount: null, paidAmount: 0 }));

    const status = await service.getAthletePaymentStatus('user-1', 'athlete-1', 2026, 10);

    expect(status.status).toBe('UNKNOWN');
    expect(status.message).toContain('уточните');
  });

  it('проверяет доступ к спортсмену: чужой ребенок запрещён', async () => {
    scope.assertAthleteAccess.mockRejectedValue(new Error('denied'));

    await expect(service.getAthletePaymentStatus('user-1', 'athlete-1', 2026, 10)).rejects.toThrow(
      'denied',
    );
    expect(repository.findPeriod).not.toHaveBeenCalled();
  });

  it('отдает подпись месяца', async () => {
    const status = await service.getAthletePaymentStatus('user-1', 'athlete-1', 2026, 10);

    expect(status.monthLabel).toBe('октябрь 2026');
  });
  describe('срок оплаты', () => {
    it('показывает дату, если клуб задал срок', async () => {
      const settings = { getClubProfile: jest.fn().mockResolvedValue({ paymentDueDay: 10 }) };
      const audit = { recordSafely: jest.fn().mockResolvedValue(null) };
      const debtRules = { getConfigForDate: jest.fn().mockResolvedValue(DEFAULT_DEBT_RULES) };

      service = new FinanceService(
        repository,
        { listFrozenAthleteIds: jest.fn().mockResolvedValue([]) } as unknown as FreezeRepository,
        scope as unknown as ResourceScopeService,
        audit as unknown as AuditService,
        debtRules as unknown as DebtRulesService,
        settings as unknown as SettingsService,
      );
      repository.findPeriod.mockResolvedValue(period({ paidAmount: 0, status: 'UNPAID' }));

      const status = await service.getAthletePaymentStatus('user-1', 'athlete-1', 2026, 12);

      expect(status.dueDate).toBe('2026-12-10');
      expect(status.message).toContain('до 10.12.2026');
    });

    it('помечает просрочку, если срок прошел', async () => {
      // Декабрь 2020: срок давно прошел.
      const settings = { getClubProfile: jest.fn().mockResolvedValue({ paymentDueDay: 10 }) };
      const audit = { recordSafely: jest.fn().mockResolvedValue(null) };
      const debtRules = { getConfigForDate: jest.fn().mockResolvedValue(DEFAULT_DEBT_RULES) };

      service = new FinanceService(
        repository,
        { listFrozenAthleteIds: jest.fn().mockResolvedValue([]) } as unknown as FreezeRepository,
        scope as unknown as ResourceScopeService,
        audit as unknown as AuditService,
        debtRules as unknown as DebtRulesService,
        settings as unknown as SettingsService,
      );
      repository.findPeriod.mockResolvedValue(period({ paidAmount: 0, status: 'UNPAID' }));

      const status = await service.getAthletePaymentStatus('user-1', 'athlete-1', 2020, 12);

      expect(status.overdue).toBe(true);
      expect(status.message).toContain('просрочена');
    });

    it('оплаченный месяц не бывает просроченным', async () => {
      const settings = { getClubProfile: jest.fn().mockResolvedValue({ paymentDueDay: 10 }) };
      const audit = { recordSafely: jest.fn().mockResolvedValue(null) };
      const debtRules = { getConfigForDate: jest.fn().mockResolvedValue(DEFAULT_DEBT_RULES) };

      service = new FinanceService(
        repository,
        { listFrozenAthleteIds: jest.fn().mockResolvedValue([]) } as unknown as FreezeRepository,
        scope as unknown as ResourceScopeService,
        audit as unknown as AuditService,
        debtRules as unknown as DebtRulesService,
        settings as unknown as SettingsService,
      );

      const status = await service.getAthletePaymentStatus('user-1', 'athlete-1', 2020, 12);

      expect(status.overdue).toBe(false);
    });
  });
});
