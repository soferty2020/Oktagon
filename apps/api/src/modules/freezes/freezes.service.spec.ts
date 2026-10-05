import { AuditService } from '../audit/audit.service';
import { ResourceScopeService } from '../identity/resource-scope.service';
import type { FreezeRecord, FreezeRepository } from './freezes.repository';
import { FreezesService } from './freezes.service';

const openFreeze: FreezeRecord = {
  id: 'freeze-1',
  athleteId: 'athlete-1',
  athleteName: 'Серик Али',
  startedOn: new Date('2026-10-01T00:00:00.000Z'),
  endedOn: null,
  reason: 'Травма',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

describe('FreezesService', () => {
  let repository: jest.Mocked<FreezeRepository>;
  let scope: { assertAthleteAccess: jest.Mock };
  let audit: { recordSafely: jest.Mock };
  let service: FreezesService;

  beforeEach(() => {
    repository = {
      listFreezes: jest.fn().mockResolvedValue([openFreeze]),
      findOpenFreeze: jest.fn().mockResolvedValue(null),
      findFreeze: jest.fn().mockResolvedValue(openFreeze),
      athleteExists: jest.fn().mockResolvedValue(true),
      createFreeze: jest.fn().mockResolvedValue(openFreeze),
      closeFreeze: jest.fn().mockResolvedValue({
        ...openFreeze,
        endedOn: new Date('2026-10-20T00:00:00.000Z'),
      }),
      listFrozenAthleteIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<FreezeRepository>;

    scope = { assertAthleteAccess: jest.fn().mockResolvedValue({ allowed: true }) };
    audit = { recordSafely: jest.fn().mockResolvedValue(null) };

    service = new FreezesService(
      repository,
      scope as unknown as ResourceScopeService,
      audit as unknown as AuditService,
    );
  });

  it('открывает заморозку', async () => {
    const view = await service.open('admin-1', 'athlete-1', { startedOn: '2026-10-01' });

    expect(repository.createFreeze).toHaveBeenCalledWith(
      expect.objectContaining({
        athleteId: 'athlete-1',
        startedOn: new Date('2026-10-01T00:00:00.000Z'),
        createdById: 'admin-1',
      }),
    );
    expect(view.isOpen).toBe(true);
    expect(audit.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'freeze.created' }),
    );
  });

  it('принимает дату начала задним числом (BR-005)', async () => {
    await service.open('admin-1', 'athlete-1', { startedOn: '2026-01-15' });

    expect(repository.createFreeze).toHaveBeenCalledWith(
      expect.objectContaining({ startedOn: new Date('2026-01-15T00:00:00.000Z') }),
    );
  });

  it('отклоняет вторую открытую заморозку', async () => {
    repository.findOpenFreeze.mockResolvedValue(openFreeze);

    await expect(
      service.open('admin-1', 'athlete-1', { startedOn: '2026-10-05' }),
    ).rejects.toMatchObject({
      code: 'FREEZE_ALREADY_OPEN',
      details: { freezeId: 'freeze-1', startedOn: '2026-10-01' },
    });
    expect(repository.createFreeze).not.toHaveBeenCalled();
  });

  it('отклоняет дату в неверном формате', async () => {
    await expect(
      service.open('admin-1', 'athlete-1', { startedOn: '01.10.2026' }),
    ).rejects.toMatchObject({ code: 'FREEZE_PERIOD_INVALID' });
  });

  it('отклоняет заморозку неизвестного спортсмена', async () => {
    repository.athleteExists.mockResolvedValue(false);

    await expect(
      service.open('admin-1', 'ghost', { startedOn: '2026-10-01' }),
    ).rejects.toMatchObject({ code: 'ATHLETE_NOT_FOUND' });
  });

  it('закрывает заморозку задним числом', async () => {
    const view = await service.close('admin-1', 'freeze-1', { endedOn: '2026-10-20' });

    expect(repository.closeFreeze).toHaveBeenCalledWith({
      id: 'freeze-1',
      endedOn: new Date('2026-10-20T00:00:00.000Z'),
      closedById: 'admin-1',
    });
    expect(view.isOpen).toBe(false);
    expect(view.endedOn).toBe('2026-10-20');
    expect(audit.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'freeze.closed' }),
    );
  });

  it('не закрывает уже закрытую заморозку', async () => {
    repository.findFreeze.mockResolvedValue({
      ...openFreeze,
      endedOn: new Date('2026-10-10T00:00:00.000Z'),
    });

    await expect(
      service.close('admin-1', 'freeze-1', { endedOn: '2026-10-20' }),
    ).rejects.toMatchObject({ code: 'FREEZE_NOT_OPEN' });
  });

  it('отклоняет завершение раньше начала', async () => {
    await expect(
      service.close('admin-1', 'freeze-1', { endedOn: '2026-09-01' }),
    ).rejects.toMatchObject({
      code: 'FREEZE_PERIOD_INVALID',
      details: { startedOn: '2026-10-01' },
    });
  });

  it('проверяет доступ к спортсмену при открытии', async () => {
    scope.assertAthleteAccess.mockRejectedValue(
      Object.assign(new Error('вне зоны'), { code: 'FORBIDDEN' }),
    );

    await expect(
      service.open('coach-1', 'athlete-1', { startedOn: '2026-10-01' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(repository.createFreeze).not.toHaveBeenCalled();
  });

  it('отдает историю заморозок', async () => {
    const freezes = await service.list('admin-1', 'athlete-1');

    expect(freezes).toHaveLength(1);
    expect(freezes[0]?.startedOn).toBe('2026-10-01');
  });
});
