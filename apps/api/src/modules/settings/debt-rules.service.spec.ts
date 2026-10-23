import { DEFAULT_DEBT_RULES, DebtExpectedMissing, DebtNoTrainingPolicy } from '@octagon/contracts';

import { AuditService } from '../audit/audit.service';
import { DebtRulesRepository, type DebtRuleRecord } from './debt-rules.repository';
import { DebtRulesService, startOfCurrentMonth, startOfMonth } from './debt-rules.service';

/**
 * Версии правил долга (K5, ADR-0014).
 *
 * Проверяется то, что нельзя проверить чистым расчетом: какая версия действует в
 * каком месяце, что прошлое менять нельзя и что изменение попадает в аудит.
 */
describe('DebtRulesService', () => {
  let repository: jest.Mocked<DebtRulesRepository>;
  let audit: { recordSafely: jest.Mock };
  let service: DebtRulesService;

  const record = (overrides: Partial<DebtRuleRecord> = {}): DebtRuleRecord => ({
    id: 'rule-1',
    version: 1,
    effectiveFrom: new Date('2026-10-01T00:00:00.000Z'),
    useFullyPaidMark: true,
    noTrainingPolicy: DebtNoTrainingPolicy.EXEMPT,
    freezePolicy: 'EXEMPT_MONTH',
    expectedMissing: DebtExpectedMissing.DEBTOR,
    toleranceKind: 'NONE',
    toleranceAmount: null,
    tolerancePercent: null,
    note: 'Значения по умолчанию: BR-004',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    createdBy: { id: 'admin-1', email: 'admin@octagon.kz' },
    ...overrides,
  });

  beforeEach(() => {
    repository = {
      findForMonth: jest.fn().mockResolvedValue(record()),
      findLatest: jest.fn().mockResolvedValue(record()),
      findByEffectiveFrom: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([record()]),
      create: jest.fn().mockImplementation(async (input) => record({ ...input, version: 2 })),
    } as unknown as jest.Mocked<DebtRulesRepository>;

    audit = { recordSafely: jest.fn().mockResolvedValue(null) };
    service = new DebtRulesService(repository, audit as unknown as AuditService);
  });

  describe('действующая версия', () => {
    it('возвращает версию, действовавшую в месяце', async () => {
      const view = await service.getForMonth('2026-10');

      expect(repository.findForMonth).toHaveBeenCalledWith(new Date(Date.UTC(2026, 9, 1)));
      expect(view.version).toBe(1);
      expect(view.effectiveFrom).toBe('2026-10-01');
      expect(view.isDefault).toBe(true);
    });

    it('возвращает дефолт BR-004, если строк в БД нет', async () => {
      repository.findForMonth.mockResolvedValue(null);

      const view = await service.getForMonth('2026-11');

      expect(view).toMatchObject(DEFAULT_DEBT_RULES);
      expect(view.version).toBe(1);
      expect(view.isDefault).toBe(true);
    });

    it('отдает настройки для даты внутри месяца', async () => {
      const config = await service.getConfigForDate(new Date('2026-10-15T00:00:00.000Z'));

      expect(config).toEqual(DEFAULT_DEBT_RULES);
    });

    it('отклоняет месяц в неверном формате', async () => {
      await expect(service.getForMonth('2026-13')).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      await expect(service.getForMonth('октябрь')).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    });
  });

  describe('новая версия', () => {
    const input = {
      effectiveFrom: currentMonth(),
      ...DEFAULT_DEBT_RULES,
      note: 'Ужесточили правило',
    };

    it('создает следующую версию и пишет аудит со старым и новым правилом', async () => {
      const view = await service.create('admin-1', input);

      expect(view.version).toBe(2);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ version: 2, createdById: 'admin-1' }),
      );
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'settings.debt_rules_updated',
          actorUserId: 'admin-1',
          before: DEFAULT_DEBT_RULES,
        }),
      );
    });

    it('не позволяет изменить прошлое', async () => {
      // Ретроспектива молча переписала бы уже отправленные отчеты (ADR-0014).
      const past = new Date(startOfCurrentMonth().getTime() - 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 7);

      await expect(service.create('admin-1', { ...input, effectiveFrom: past })).rejects.toMatchObject(
        { code: 'DEBT_RULES_EFFECTIVE_IN_PAST' },
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('не создает вторую версию на тот же месяц', async () => {
      repository.findByEffectiveFrom.mockResolvedValue(record());

      await expect(service.create('admin-1', input)).rejects.toMatchObject({
        code: 'DEBT_RULES_VERSION_CONFLICT',
      });
    });

    it('принимает допуск суммой и сохраняет его', async () => {
      await service.create('admin-1', {
        ...input,
        partialTolerance: { kind: 'FIXED', amount: 1_500 },
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ toleranceKind: 'FIXED', toleranceAmount: 1_500 }),
      );
    });

    it('принимает допуск процентом', async () => {
      await service.create('admin-1', {
        ...input,
        partialTolerance: { kind: 'PERCENT', percent: 2 },
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ toleranceKind: 'PERCENT', tolerancePercent: 2 }),
      );
    });

    it('отклоняет отрицательный допуск суммой', async () => {
      await expect(
        service.create('admin-1', {
          ...input,
          partialTolerance: { kind: 'FIXED', amount: -1 },
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('отклоняет процент вне диапазона', async () => {
      await expect(
        service.create('admin-1', {
          ...input,
          partialTolerance: { kind: 'PERCENT', percent: 150 },
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  it('история версий отдается списком', async () => {
    const versions = await service.listVersions();

    expect(versions).toHaveLength(1);
    expect(versions[0].isDefault).toBe(true);
  });

  it('месяц приводится к первому числу в UTC', () => {
    expect(startOfMonth('2026-02').toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });
});

/** Текущий месяц `YYYY-MM` — база для тестов создания версии. */
function currentMonth(): string {
  return startOfCurrentMonth().toISOString().slice(0, 7);
}
