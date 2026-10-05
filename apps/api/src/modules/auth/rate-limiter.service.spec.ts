import type { Redis } from 'ioredis';

import { RateLimiterService } from './rate-limiter.service';

/**
 * docs/15-security.md: rate limiting auth-эндпоинтов.
 * Проверяем фиксированное окно на Redis: INCR + EXPIRE + TTL.
 */
describe('RateLimiterService', () => {
  let client: jest.Mocked<Pick<Redis, 'incr' | 'expire' | 'ttl'>>;
  let service: RateLimiterService;

  beforeEach(() => {
    client = {
      incr: jest.fn(),
      expire: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(60),
    };
    service = new RateLimiterService(
      { client: undefined } as never,
      client as unknown as Redis,
    );
  });

  it('пропускает попытки в пределах лимита', async () => {
    client.incr.mockResolvedValue(3);

    const result = await service.consume('auth:ip:1.2.3.4', 10, 60);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(7);
    expect(result.retryAfterSeconds).toBe(60);
  });

  it('ставит TTL только на первой попытке', async () => {
    client.incr.mockResolvedValueOnce(1);
    await service.consume('auth:ip:1.2.3.4', 10, 60);
    expect(client.expire).toHaveBeenCalledTimes(1);
    expect(client.expire).toHaveBeenCalledWith('ratelimit:auth:ip:1.2.3.4', 60);

    client.incr.mockResolvedValueOnce(2);
    await service.consume('auth:ip:1.2.3.4', 10, 60);
    // окно не продлевается: иначе лимит никогда не сбросился бы
    expect(client.expire).toHaveBeenCalledTimes(1);
  });

  it('блокирует попытку сверх лимита и сообщает остаток времени', async () => {
    client.incr.mockResolvedValue(11);
    client.ttl.mockResolvedValue(42);

    const result = await service.consume('auth:email:a@b.c', 10, 60);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBe(42);
  });

  it('не отдает отрицательный остаток', async () => {
    client.incr.mockResolvedValue(99);

    const result = await service.consume('auth:email:a@b.c', 10, 60);

    expect(result.remaining).toBe(0);
  });

  it('подставляет длину окна, если TTL неопределен', async () => {
    client.incr.mockResolvedValue(5);
    client.ttl.mockResolvedValue(-1);

    const result = await service.consume('auth:ip:1.2.3.4', 10, 60);

    expect(result.retryAfterSeconds).toBe(60);
  });
});
