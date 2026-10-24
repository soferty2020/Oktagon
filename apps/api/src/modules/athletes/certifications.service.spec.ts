import { CertificationStageKind } from '@octagon/contracts';

import { AuditService } from '../audit/audit.service';
import { ResourceScopeService } from '../identity/resource-scope.service';
import { CertificationsRepository, type CertificationRecord } from './certifications.repository';
import { CertificationsService } from './certifications.service';

/**
 * Аттестации: присвоение ступени и отмена ошибочной записи.
 *
 * Ключевое, что проверяется: аттестация валидируется до записи (будущая дата,
 * ступень вне диапазона, пояс не из справочника), а каждая операция попадает в
 * аудит. Пересчет пояса при отмене — на стороне репозитория (транзакция).
 */
describe('CertificationsService', () => {
  let repository: jest.Mocked<CertificationsRepository>;
  let scope: { assertAthleteAccess: jest.Mock };
  let audit: { recordSafely: jest.Mock };
  let service: CertificationsService;

  const record = (overrides: Partial<CertificationRecord> = {}): CertificationRecord => ({
    id: 'cert-1',
    athleteId: 'athlete-1',
    certifiedOn: new Date('2024-02-10T00:00:00.000Z'),
    beltGrade: 'YELLOW',
    stageKind: CertificationStageKind.KYU,
    stageNumber: 8,
    note: null,
    createdAt: new Date('2024-02-10T10:00:00.000Z'),
    createdBy: { id: 'admin-1', email: 'admin@octagon.kz' },
    ...overrides,
  });

  const input = {
    certifiedOn: '2024-02-10',
    beltGrade: 'YELLOW',
    stageKind: CertificationStageKind.KYU,
    stageNumber: 8,
  };

  beforeEach(() => {
    repository = {
      listForAthlete: jest.fn().mockResolvedValue([record()]),
      findById: jest.fn().mockResolvedValue(record()),
      create: jest.fn().mockResolvedValue(record()),
      cancel: jest.fn().mockResolvedValue(record()),
    } as unknown as jest.Mocked<CertificationsRepository>;

    scope = { assertAthleteAccess: jest.fn().mockResolvedValue({ allowed: true }) };
    audit = { recordSafely: jest.fn().mockResolvedValue(null) };

    service = new CertificationsService(
      repository,
      scope as unknown as ResourceScopeService,
      audit as unknown as AuditService,
    );
  });

  it('отдает историю с подписью ступени', async () => {
    const history = await service.list('admin-1', 'athlete-1');

    expect(history[0]).toMatchObject({
      id: 'cert-1',
      certifiedOn: '2024-02-10',
      beltGrade: 'YELLOW',
      stageLabel: '8 кю',
    });
  });

  it('проверяет доступ к спортсмену перед чтением', async () => {
    scope.assertAthleteAccess.mockRejectedValue(new Error('denied'));

    await expect(service.list('admin-1', 'athlete-1')).rejects.toThrow('denied');
    expect(repository.listForAthlete).not.toHaveBeenCalled();
  });

  it('создает аттестацию и пишет аудит', async () => {
    const created = await service.create('admin-1', 'athlete-1', input);

    expect(created.beltGrade).toBe('YELLOW');
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        athleteId: 'athlete-1',
        beltGrade: 'YELLOW',
        stageKind: 'KYU',
        stageNumber: 8,
        createdById: 'admin-1',
      }),
    );
    expect(audit.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'athlete.certified',
        entityType: 'Certification',
        entityId: 'cert-1',
        actorUserId: 'admin-1',
      }),
    );
  });

  it('отклоняет будущую дату аттестации', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await expect(
      service.create('admin-1', 'athlete-1', { ...input, certifiedOn: future }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('отклоняет ступень вне диапазона', async () => {
    await expect(
      service.create('admin-1', 'athlete-1', { ...input, stageNumber: 0 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await expect(
      service.create('admin-1', 'athlete-1', { ...input, stageNumber: 11 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('отклоняет пояс не из справочника', async () => {
    await expect(
      service.create('admin-1', 'athlete-1', { ...input, beltGrade: 'GREY' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('принимает дату аттестации сегодня', async () => {
    const today = new Date().toISOString().slice(0, 10);

    await service.create('admin-1', 'athlete-1', { ...input, certifiedOn: today });

    expect(repository.create).toHaveBeenCalled();
  });

  describe('отмена', () => {
    it('удаляет запись и пишет аудит', async () => {
      await service.cancel('admin-1', 'cert-1');

      expect(repository.cancel).toHaveBeenCalledWith('cert-1');
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'athlete.certification_cancelled',
          entityId: 'cert-1',
          before: expect.objectContaining({ beltGrade: 'YELLOW', stage: '8 кю' }),
        }),
      );
    });

    it('не находит аттестацию', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.cancel('admin-1', 'cert-404')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('проверяет доступ к спортсмену аттестации', async () => {
      scope.assertAthleteAccess.mockRejectedValue(new Error('denied'));

      await expect(service.cancel('admin-1', 'cert-1')).rejects.toThrow('denied');
      expect(repository.cancel).not.toHaveBeenCalled();
    });
  });
});
