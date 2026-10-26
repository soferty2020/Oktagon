import type { AuditService } from '../audit/audit.service';
import type { ResourceScopeService } from '../identity/resource-scope.service';
import type { EntriesRepository } from './entries.repository';
import { CompetitionEntriesService } from './competition-entries.service';

/**
 * Результаты турнира (#37–#38).
 *
 * Проверяем правила, а не вызовы: место обязательно для призового результата,
 * неявившийся без медали, ката без встреч, категория — снимком, исправление
 * опубликованного требует причины.
 */
describe('CompetitionEntriesService', () => {
  let repository: jest.Mocked<EntriesRepository>;
  let scope: { assertAthleteAccess: jest.Mock };
  let audit: { recordSafely: jest.Mock };
  let service: CompetitionEntriesService;

  const participant = {
    id: 'participant-1',
    competitionId: 'competition-1',
    athleteId: 'athlete-1',
    responsibleTrainerId: null,
    paymentStatus: 'UNPAID',
    athlete: { firstName: 'Максим', lastName: 'Иванов' },
  };

  const entry = (overrides: Record<string, unknown> = {}) => ({
    id: 'entry-1',
    participantId: 'participant-1',
    categoryId: 'category-1',
    discipline: 'KUMITE',
    categorySnapshot: 'Юноши до 45 кг',
    result: 'PENDING',
    place: null,
    medal: 'NONE',
    comment: null,
    ...overrides,
  });

  beforeEach(() => {
    repository = {
      findParticipant: jest.fn().mockResolvedValue(participant),
      createParticipant: jest.fn().mockResolvedValue({ ...participant, id: 'participant-1' }),
      updateParticipant: jest.fn().mockResolvedValue({ ...participant, paymentStatus: 'PAID' }),
      findCategory: jest.fn().mockResolvedValue({ id: 'category-1', discipline: 'KUMITE', name: 'Юноши до 45 кг' }),
      findEntry: jest.fn().mockResolvedValue(null),
      findEntryById: jest.fn().mockResolvedValue(entry()),
      createEntry: jest.fn().mockResolvedValue(entry()),
      recordResult: jest.fn().mockImplementation((input: { result: string; place: number | null; medal: string }) =>
        Promise.resolve(entry({ result: input.result, place: input.place, medal: input.medal })),
      ),
      isPublished: jest.fn().mockResolvedValue(false),
      createMatch: jest.fn().mockResolvedValue({ id: 'match-1' }),
      listMatches: jest.fn().mockResolvedValue([]),
      countPending: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<EntriesRepository>;

    scope = { assertAthleteAccess: jest.fn().mockResolvedValue(undefined) };
    audit = { recordSafely: jest.fn().mockResolvedValue(null) };

    const identity = { listLinkedAthletes: jest.fn().mockResolvedValue([]) };
    service = new CompetitionEntriesService(
      repository,
      scope as unknown as ResourceScopeService,
      audit as unknown as AuditService,
      identity as unknown as import('../identity/identity.service').IdentityService,
    );
  });

  it('PLACED требует место', async () => {
    await expect(
      service.recordResult('admin-1', 'competition-1', 'athlete-1', 'entry-1', { result: 'PLACED' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('PLACED с местом проходит', async () => {
    const result = await service.recordResult('admin-1', 'competition-1', 'athlete-1', 'entry-1', {
      result: 'PLACED',
      place: 1,
      medal: 'GOLD',
    });

    expect(result.place).toBe(1);
    expect(result.medal).toBe('GOLD');
  });

  it('NO_SHOW не может иметь медаль', async () => {
    await expect(
      service.recordResult('admin-1', 'competition-1', 'athlete-1', 'entry-1', {
        result: 'NO_SHOW',
        medal: 'GOLD',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('место и медаль независимы: третье место без медали допустимо', async () => {
    const result = await service.recordResult('admin-1', 'competition-1', 'athlete-1', 'entry-1', {
      result: 'PLACED',
      place: 3,
    });

    expect(result.medal).toBe('NONE');
  });

  it('ката не принимает встречи', async () => {
    repository.findEntryById.mockResolvedValue(entry({ discipline: 'KATA' }) as never);

    await expect(
      service.addMatch('admin-1', 'competition-1', 'athlete-1', 'entry-1', {
        round: 1,
        opponentName: 'Иванов И.',
        result: 'WIN',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('кумитэ принимает встречу', async () => {
    await service.addMatch('admin-1', 'competition-1', 'athlete-1', 'entry-1', {
      round: 1,
      opponentName: 'Иванов И.',
      result: 'WIN',
    });

    expect(repository.createMatch).toHaveBeenCalled();
  });

  it('категория сохраняется снимком в участии', async () => {
    await service.addEntry('admin-1', 'competition-1', 'athlete-1', 'KUMITE', 'category-1');

    expect(repository.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ categorySnapshot: 'Юноши до 45 кг' }),
    );
  });

  it('категория другой дисциплины не принимается', async () => {
    repository.findCategory.mockResolvedValue({ id: 'category-1', discipline: 'KATA', name: 'Ката' } as never);

    await expect(
      service.addEntry('admin-1', 'competition-1', 'athlete-1', 'KUMITE', 'category-1'),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('исправление опубликованного требует причины', async () => {
    repository.isPublished.mockResolvedValue(true);
    repository.findEntryById.mockResolvedValue(entry({ result: 'PLACED', place: 1 }) as never);

    await expect(
      service.recordResult('admin-1', 'competition-1', 'athlete-1', 'entry-1', { result: 'PARTICIPATED' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('исправление опубликованного с причиной версионируется', async () => {
    repository.isPublished.mockResolvedValue(true);
    repository.findEntryById.mockResolvedValue(entry({ result: 'PLACED', place: 1 }) as never);

    await service.recordResult('admin-1', 'competition-1', 'athlete-1', 'entry-1', {
      result: 'PARTICIPATED',
      reason: 'Ошибка протокола',
    });

    expect(repository.recordResult).toHaveBeenCalledWith(
      expect.objectContaining({ withRevision: true, reason: 'Ошибка протокола' }),
    );
  });

  it('чужой спортсмен не заявляется тренером', async () => {
    scope.assertAthleteAccess.mockRejectedValue(new Error('FORBIDDEN'));

    await expect(
      service.addParticipant('trainer-1', 'competition-1', 'athlete-1', null),
    ).rejects.toThrow();
  });

  it('тренер отмечает оплату своего спортсмена', async () => {
    await service.setPayment('trainer-1', 'competition-1', 'athlete-1', 'PAID');

    expect(repository.updateParticipant).toHaveBeenCalledWith('participant-1', { paymentStatus: 'PAID' });
  });
});
