import { DEFAULT_DEBT_RULES } from '@octagon/contracts';

import { AuditService } from '../audit/audit.service';
import type { FreezeRepository } from '../freezes/freezes.repository';
import { ResourceScopeService } from '../identity/resource-scope.service';
import { DebtRulesService } from '../settings/debt-rules.service';
import { SettingsService } from '../settings/settings.service';
import type { FinanceRepository } from './finance.repository';
import { FinanceService } from './finance.service';

/**
 * Отчёты клуба: динамика по месяцам и выгрузка в CSV.
 *
 * Проверяется то, что видит бухгалтер: порядок месяцев (от старых к новым),
 * разделение выручки и долга, BOM и `;` в CSV, экранирование и отказ на
 * перевернутом периоде.
 */
describe('FinanceService: отчёты', () => {
  let repository: jest.Mocked<FinanceRepository>;
  let service: FinanceService;

  const period = {
    id: 'period-1',
    athleteId: 'athlete-1',
    year: 2026,
    month: 10,
    expectedAmount: 50000,
    paidAmount: 40000,
    refundedAmount: 0,
    status: 'PARTIALLY_PAID' as const,
    fullyPaidMarkedAt: null,
    fullyPaidMarkedById: null,
    note: null,
    payments: [],
  };

  beforeEach(() => {
    repository = {
      listActiveAthletes: jest
        .fn()
        .mockResolvedValue([
          { athleteId: 'athlete-1', firstName: 'Али', lastName: 'Серик', status: 'ACTIVE' },
        ]),
      athleteIdsWithMembershipInMonth: jest
        .fn()
        .mockResolvedValue([{ athleteId: 'athlete-1', joinedAt: new Date('2026-09-01'), leftAt: null }]),
      hasGroupTrainingInMonth: jest.fn().mockResolvedValue(true),
      listPeriodsForMonth: jest.fn().mockResolvedValue([period]),
      listMovementsInRange: jest
        .fn()
        .mockResolvedValue([{ kind: 'PAYMENT', amount: 40000, hallId: null }]),
      listPaymentsForExport: jest.fn().mockResolvedValue([
        {
          id: 'pay-1',
          paidAt: new Date('2026-10-05T10:00:00.000Z'),
          kind: 'PAYMENT',
          amount: 40000,
          method: 'CASH',
          athleteLastName: 'Серик',
          athleteFirstName: 'Али',
          groupName: 'Дети 7-9 лет',
          note: 'октябрь',
        },
      ]),
    } as unknown as jest.Mocked<FinanceRepository>;

    const freezes = { listFrozenAthleteIds: jest.fn().mockResolvedValue([]) };
    const scope = {
    assertAthleteAccess: jest.fn().mockResolvedValue({ allowed: true }),
    // Отчёты проверяются без ограничения зоны доступа.
    visibleAthleteIds: jest.fn().mockResolvedValue(null),
  };
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

  describe('динамика', () => {
    it('идет от старых к новым и считает выручку по движениям', async () => {
      const dynamics = await service.dynamics('admin-1', 2026, 10, 3);

      expect(dynamics.points).toHaveLength(3);
      expect(dynamics.points.map((point) => point.month)).toEqual([8, 9, 10]);
      expect(dynamics.points[2]).toMatchObject({
        year: 2026,
        month: 10,
        received: 40000,
        revenue: 40000,
      });
    });

    it('ограничивает период 12 месяцами', async () => {
      const dynamics = await service.dynamics('admin-1', 2026, 10, 99);

      expect(dynamics.points).toHaveLength(12);
    });

    it('не считает сумму долга, если есть должники без ожидаемой суммы', async () => {
      repository.listPeriodsForMonth.mockResolvedValue([]);

      const dynamics = await service.dynamics('admin-1', 2026, 10, 1);

      expect(dynamics.points[0].debtorsWithoutExpected).toBe(1);
      expect(dynamics.points[0].debt).toBeNull();
    });

    it('считает долг как остаток по ожидаемым суммам', async () => {
      const dynamics = await service.dynamics('admin-1', 2026, 10, 1);

      expect(dynamics.points[0].debtors).toBe(1);
      expect(dynamics.points[0].debt).toBe(10000);
    });

    it('вычитает возвраты из выручки', async () => {
      repository.listMovementsInRange.mockResolvedValue([
        { kind: 'PAYMENT', athleteId: 'athlete-1', amount: 40000, hallId: null },
        { kind: 'REFUND', athleteId: 'athlete-1', amount: 5000, hallId: null },
      ]);

      const dynamics = await service.dynamics('admin-1', 2026, 10, 1);

      expect(dynamics.points[0]).toMatchObject({ received: 40000, refunded: 5000, revenue: 35000 });
    });
  });

  describe('CSV', () => {
    it('должники: BOM, заголовок и разделитель ;', async () => {
      const file = await service.exportDebtorsCsv('admin-1', 2026, 10);

      expect(file.filename).toBe('debtors-2026-10.csv');
      expect(file.content.startsWith('\uFEFF')).toBe(true);
      expect(file.content).toContain('Спортсмен;Должник');
      expect(file.content).toContain('Серик Али;да');
    });

    it('должники: остаток считается от ожидаемой суммы', async () => {
      const file = await service.exportDebtorsCsv('admin-1', 2026, 10);

      expect(file.content).toContain('50000;40000;10000');
    });

    it('движения: строка оплаты с типом и суммой', async () => {
      const file = await service.exportPaymentsCsv('admin-1', '2026-10-01', '2026-11-01');

      expect(file.filename).toBe('payments-2026-10-01-2026-11-01.csv');
      expect(file.content).toContain('Поступление');
      expect(file.content).toContain('40000');
      expect(file.content).toContain('Али');
    });

    it('движения: отклоняет перевернутый период', async () => {
      await expect(
        service.exportPaymentsCsv('admin-1', '2026-11-01', '2026-10-01'),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('нейтрализует формулу в ячейке (#56, SEC-20)', async () => {
      repository.listPaymentsForExport.mockResolvedValue([
        {
          id: 'pay-formula',
          athleteId: 'athlete-1',
          paidAt: new Date('2026-10-05T10:00:00.000Z'),
          kind: 'PAYMENT',
          amount: 1000,
          method: 'CASH',
          athleteLastName: '=HYPERLINK("http://evil","жми")',
          athleteFirstName: 'Али',
          groupName: null,
          note: null,
        },
      ]);

      const file = await service.exportPaymentsCsv('admin-1', '2026-10-01', '2026-11-01');

      // Апостроф перед «=» не даёт Excel выполнить формулу.
      expect(file.content).toContain("'=HYPERLINK");
      expect(file.content).not.toMatch(/(^|;)=HYPERLINK/);
    });

    it('движения: отклоняет некорректную дату', async () => {
      await expect(
        service.exportPaymentsCsv('admin-1', 'вчера', '2026-11-01'),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('экранирует точку с запятой в значении', async () => {
      repository.listPaymentsForExport.mockResolvedValue([
        {
          id: 'pay-2',
          athleteId: 'athlete-1',
          paidAt: new Date('2026-10-05T10:00:00.000Z'),
          kind: 'PAYMENT',
          amount: 1000,
          method: 'CASH',
          athleteLastName: 'Серик',
          athleteFirstName: 'Али',
          groupName: 'Дети; новички',
          note: null,
        },
      ]);

      const file = await service.exportPaymentsCsv('admin-1', '2026-10-01', '2026-11-01');

      expect(file.content).toContain('"Дети; новички"');
    });
  });
});
