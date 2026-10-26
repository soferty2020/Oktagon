import type { AuditService } from '../audit/audit.service';
import type { ResourceScopeService } from '../identity/resource-scope.service';
import type { ParticipantsRepository, ResultsRepository } from './participants.repository';
import { ResultsService } from './results.service';

/**
 * Результаты аттестации (#35).
 *
 * Проверяем последствия, а не вызовы: PASSED присваивает ступень, FAILED/NO_SHOW
 * её не трогают, исправление требует причины, переход через ступени — обоснования.
 */
describe('ResultsService', () => {
  let participants: jest.Mocked<ParticipantsRepository>;
  let results: jest.Mocked<ResultsRepository>;
  let scope: { assertAthleteAccess: jest.Mock };
  let audit: { recordSafely: jest.Mock };
  let service: ResultsService;

  const participant = (overrides: Record<string, unknown> = {}) => ({
    id: 'participant-1',
    eventId: 'event-1',
    athleteId: 'athlete-1',
    responsibleTrainerId: null,
    targetRank: 'kyu-8',
    snapshotRank: 'kyu-10',
    admission: 'ADMITTED',
    paymentStatus: 'PAID',
    result: 'PENDING',
    awardedRank: null,
    resultComment: null,
    certificationId: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    athlete: { id: 'athlete-1', firstName: 'Максим', lastName: 'Иванов' },
    responsibleTrainer: null,
    ...overrides,
  });

  beforeEach(() => {
    participants = {
      find: jest.fn().mockResolvedValue(participant()),
      isResponsibleTrainer: jest.fn().mockResolvedValue(false),
      revisions: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ParticipantsRepository>;

    results = {
      record: jest.fn().mockImplementation((input: { result: string; awardedRank: string | null }) =>
        Promise.resolve({
          participant: participant({ result: input.result, awardedRank: input.awardedRank }),
          certificationId: input.result === 'PASSED' ? 'cert-1' : null,
          version: 1,
        }),
      ),
    } as unknown as jest.Mocked<ResultsRepository>;

    scope = { assertAthleteAccess: jest.fn().mockResolvedValue(undefined) };
    audit = { recordSafely: jest.fn().mockResolvedValue(null) };

    service = new ResultsService(
      participants,
      results,
      scope as unknown as ResourceScopeService,
      audit as unknown as AuditService,
    );
  });

  it('PASSED присваивает целевую ступень, если она не менялась', async () => {
    await service.record('admin-1', true, 'event-1', 'athlete-1', { result: 'PASSED' });

    expect(results.record).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'PASSED', awardedRank: 'kyu-8', awardedBelt: 'BLUE' }),
    );
  });

  it('переход через ступени требует обоснования', async () => {
    await expect(
      service.record('admin-1', true, 'event-1', 'athlete-1', {
        result: 'PASSED',
        awardedRank: 'kyu-4',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('переход через ступени с обоснованием проходит', async () => {
    await service.record('admin-1', true, 'event-1', 'athlete-1', {
      result: 'PASSED',
      awardedRank: 'kyu-4',
      reason: 'Решение аттестационной комиссии',
    });

    expect(results.record).toHaveBeenCalledWith(
      expect.objectContaining({ awardedRank: 'kyu-4', reason: 'Решение аттестационной комиссии' }),
    );
  });

  it('FAILED не присваивает ступень', async () => {
    await service.record('admin-1', true, 'event-1', 'athlete-1', { result: 'FAILED' });

    expect(results.record).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'FAILED', awardedRank: null }),
    );
  });

  it('NO_SHOW не присваивает ступень', async () => {
    await service.record('admin-1', true, 'event-1', 'athlete-1', { result: 'NO_SHOW' });

    expect(results.record).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'NO_SHOW', awardedRank: null }),
    );
  });

  it('исправление сохранённого итога требует причины', async () => {
    participants.find.mockResolvedValue(participant({ result: 'PASSED', awardedRank: 'kyu-8' }) as never);

    await expect(
      service.record('admin-1', true, 'event-1', 'athlete-1', { result: 'FAILED' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('исправление с причиной проходит и пишет аудит', async () => {
    participants.find.mockResolvedValue(participant({ result: 'PASSED', awardedRank: 'kyu-8' }) as never);

    await service.record('admin-1', true, 'event-1', 'athlete-1', {
      result: 'FAILED',
      reason: 'Ошибка в протоколе',
    });

    expect(audit.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'attestation.result_corrected' }),
    );
  });

  it('чужой тренер не записывает результат', async () => {
    scope.assertAthleteAccess.mockRejectedValue(new Error('FORBIDDEN'));

    await expect(
      service.record('trainer-1', false, 'event-1', 'athlete-1', { result: 'PASSED' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('ответственный тренер пишет результат даже вне зоны доступа', async () => {
    scope.assertAthleteAccess.mockRejectedValue(new Error('FORBIDDEN'));
    participants.isResponsibleTrainer.mockResolvedValue(true);

    await service.record('trainer-1', false, 'event-1', 'athlete-1', { result: 'PASSED' });

    expect(results.record).toHaveBeenCalled();
  });
});
