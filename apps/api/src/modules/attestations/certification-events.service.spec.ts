import { CertificationEventStatus } from '@octagon/contracts';

import type { AuditService } from '../audit/audit.service';
import type {
  CertificationEventRecord,
  CertificationEventsRepository,
} from './certification-events.repository';
import { CertificationEventsService } from './certification-events.service';

/**
 * Мероприятия аттестаций (#33).
 *
 * Проверяем правила, а не «метод вызвался»: переходы статусов, владение,
 * запрет завершения при незаполненных итогах и архивирование при отмене.
 */
describe('CertificationEventsService', () => {
  let repository: jest.Mocked<CertificationEventsRepository>;
  let audit: { recordSafely: jest.Mock };
  let service: CertificationEventsService;

  const event = (overrides: Partial<CertificationEventRecord> = {}): CertificationEventRecord => ({
    id: 'event-1',
    title: 'Осенняя аттестация',
    scheduledAt: new Date('2026-11-15T10:00:00.000Z'),
    location: 'Зал 1',
    organizer: null,
    description: null,
    status: CertificationEventStatus.DRAFT,
    createdById: 'trainer-1',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    publishedAt: null,
    publishedById: null,
    cancelledAt: null,
    createdBy: { id: 'trainer-1', email: 'trainer@club.ru' },
    publishedBy: null,
    _count: { participants: 0 },
    participants: [],
    ...overrides,
  });

  beforeEach(() => {
    repository = {
      list: jest.fn().mockResolvedValue([event()]),
      findById: jest.fn().mockResolvedValue(event()),
      create: jest.fn().mockResolvedValue(event()),
      update: jest.fn().mockImplementation((_id: string, patch: Partial<CertificationEventRecord>) =>
        Promise.resolve(event(patch as Partial<CertificationEventRecord>)),
      ),
      countPendingResults: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<CertificationEventsRepository>;

    audit = { recordSafely: jest.fn().mockResolvedValue(null) };
    const identity = { listLinkedAthletes: jest.fn().mockResolvedValue([]) };
    service = new CertificationEventsService(
      repository,
      audit as unknown as AuditService,
      identity as unknown as import('../identity/identity.service').IdentityService,
    );
  });

  it('создаёт мероприятие черновиком и пишет аудит', async () => {
    await service.create('trainer-1', {
      title: 'Осенняя аттестация',
      scheduledAt: '2026-11-15T10:00:00.000Z',
    });

    expect(repository.create).toHaveBeenCalledWith({
      title: 'Осенняя аттестация',
      scheduledAt: '2026-11-15T10:00:00.000Z',
      createdById: 'trainer-1',
    });
    expect(audit.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'attestation.event_created' }),
    );
  });

  it('переводит черновик в запланированное', async () => {
    const result = await service.transition('trainer-1', false, 'event-1', 'PLANNED');

    expect(result.status).toBe('PLANNED');
  });

  it('не даёт завершить, пока у кого-то нет итога', async () => {
    repository.findById.mockResolvedValue(event({ status: CertificationEventStatus.IN_PROGRESS }));
    repository.countPendingResults.mockResolvedValue(2);

    await expect(
      service.transition('trainer-1', false, 'event-1', 'COMPLETED'),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('завершает, когда итоги есть у всех', async () => {
    repository.findById.mockResolvedValue(event({ status: CertificationEventStatus.IN_PROGRESS }));

    const result = await service.transition('trainer-1', false, 'event-1', 'COMPLETED');

    expect(result.status).toBe('COMPLETED');
  });

  it('не даёт отменить опубликованное: результаты уже у родителей', async () => {
    repository.findById.mockResolvedValue(event({ status: CertificationEventStatus.PUBLISHED }));

    await expect(
      service.transition('trainer-1', true, 'event-1', 'CANCELLED'),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('отмена ставит время и сохраняет результаты (не удаляет)', async () => {
    const result = await service.transition('trainer-1', false, 'event-1', 'CANCELLED');

    expect(result.status).toBe('CANCELLED');
    expect(repository.update).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({ status: 'CANCELLED', cancelledAt: expect.any(Date) as unknown }),
    );
  });

  it('чужое мероприятие не меняет даже тренер: только создатель или руководитель', async () => {
    repository.findById.mockResolvedValue(event({ createdById: 'trainer-2' }));

    await expect(
      service.update('trainer-1', false, 'event-1', { title: 'Новое название' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('руководитель меняет чужое мероприятие', async () => {
    repository.findById.mockResolvedValue(event({ createdById: 'trainer-2' }));

    const result = await service.update('admin-1', true, 'event-1', { title: 'Новое название' });

    expect(result.title).toBe('Новое название');
  });

  it('публикует только завершённое', async () => {
    repository.findById.mockResolvedValue(event({ status: CertificationEventStatus.PLANNED }));

    await expect(service.publish('trainer-1', false, 'event-1')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('при публикации фиксирует время и автора', async () => {
    repository.findById.mockResolvedValue(event({ status: CertificationEventStatus.COMPLETED }));

    await service.publish('trainer-1', false, 'event-1');

    expect(repository.update).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        status: 'PUBLISHED',
        publishedById: 'trainer-1',
        publishedAt: expect.any(Date) as unknown,
      }),
    );
  });

  it('опубликованное мероприятие не редактируется', async () => {
    repository.findById.mockResolvedValue(event({ status: CertificationEventStatus.PUBLISHED }));

    await expect(
      service.update('trainer-1', false, 'event-1', { title: 'Правка' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
