import type { RateLimiterService } from '../auth/rate-limiter.service';
import type { TrialRequestsRepository } from './trial-requests.repository';
import { TrialRequestsService } from './trial-requests.service';

/**
 * Заявки на пробную тренировку (ADR-0013).
 *
 * Проверяем защиту публичной формы и необратимость финальных статусов — то, что
 * нельзя увидеть в интерфейсе, но что ломает воронку, если сломается.
 */
describe('TrialRequestsService', () => {
  let repository: jest.Mocked<TrialRequestsRepository>;
  let rateLimiter: { consume: jest.Mock };
  let service: TrialRequestsService;

  const record = (overrides: Record<string, unknown> = {}) => ({
    id: 'request-1',
    name: 'Анна',
    phone: '+79991234567',
    email: null,
    childName: null,
    childAge: null,
    comment: null,
    source: null,
    status: 'NEW',
    processedAt: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    processedBy: null,
    ...overrides,
  });

  beforeEach(() => {
    repository = {
      list: jest.fn().mockResolvedValue([record()]),
      findById: jest.fn().mockResolvedValue(record()),
      create: jest.fn().mockImplementation((input: Record<string, unknown>) =>
        Promise.resolve(record(input)),
      ),
      updateStatus: jest.fn().mockImplementation((_id: string, status: string) =>
        Promise.resolve(record({ status })),
      ),
    } as unknown as jest.Mocked<TrialRequestsRepository>;

    rateLimiter = {
      consume: jest.fn().mockResolvedValue({ allowed: true, remaining: 4, retryAfterSeconds: 3600 }),
    };

    service = new TrialRequestsService(
      repository,
      rateLimiter as unknown as RateLimiterService,
    );
  });

  it('создаёт заявку и обрезает пробелы', async () => {
    await service.submit({ name: '  Анна ', phone: ' +79991234567 ' }, '1.2.3.4');

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Анна', phone: '+79991234567' }),
    );
  });

  it('honeypot: заявка не создаётся, но ошибки нет', async () => {
    const result = await service.submit(
      { name: 'Бот', phone: '+70000000000', website: 'http://spam' },
      '1.2.3.4',
    );

    expect(result).toBeNull();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('лимит по IP: шестая заявка за час отвергается', async () => {
    rateLimiter.consume.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 600 });

    await expect(
      service.submit({ name: 'Анна', phone: '+79991234567' }, '1.2.3.4'),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('без IP (доверенный прокси не передал) заявка проходит', async () => {
    await service.submit({ name: 'Анна', phone: '+79991234567' }, null);

    expect(rateLimiter.consume).not.toHaveBeenCalled();
  });

  it('финальный статус не возвращается в работу', async () => {
    repository.findById.mockResolvedValue(record({ status: 'CONVERTED' }) as never);

    await expect(service.updateStatus('admin-1', 'request-1', 'CONTACTED')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('повторная установка того же финального статуса допустима', async () => {
    repository.findById.mockResolvedValue(record({ status: 'REJECTED' }) as never);

    const result = await service.updateStatus('admin-1', 'request-1', 'REJECTED');

    expect(result.status).toBe('REJECTED');
  });

  it('двигает заявку по воронке', async () => {
    const result = await service.updateStatus('admin-1', 'request-1', 'CONTACTED');

    expect(result.status).toBe('CONTACTED');
    expect(repository.updateStatus).toHaveBeenCalledWith('request-1', 'CONTACTED', 'admin-1');
  });
});
