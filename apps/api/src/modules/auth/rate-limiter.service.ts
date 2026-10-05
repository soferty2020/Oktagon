import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { RedisService } from '../../redis';

/** DI-токен клиента Redis: упрощает подмену в тестах. */
export const RATE_LIMIT_REDIS = 'RATE_LIMIT_REDIS';

export interface RateLimitResult {
  allowed: boolean;
  /** Сколько запросов осталось в текущем окне. */
  remaining: number;
  /** Через сколько секунд окно сбросится. */
  retryAfterSeconds: number;
}

/**
 * Счетчик запросов в фиксированном окне на Redis.
 *
 * Реализует требование docs/15-security.md (rate limiting auth-эндпоинтов).
 * Фиксированное окно выбрано для MVP: `INCR` + `EXPIRE` — две команды без
 * транзакций, поэтому лимитер не станет узким местом и не требует Lua.
 *
 * Ключ строится по назначению и субъекту, например `ratelimit:auth:ip:<ip>`.
 */
@Injectable()
export class RateLimiterService {
  constructor(
    private readonly redis: RedisService,
    @Inject(RATE_LIMIT_REDIS) private readonly clientOverride?: Redis,
  ) {}

  /**
   * Учитывает попытку и сообщает, разрешена ли она.
   *
   * @param key уникальный ключ окна (назначение + субъект).
   * @param max сколько попыток допускается в окне.
   * @param windowSeconds длина окна в секундах.
   */
  async consume(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
    const client = this.clientOverride ?? this.redis.client;
    const redisKey = `ratelimit:${key}`;

    const count = await client.incr(redisKey);
    if (count === 1) {
      // TTL ставим только на первой попытке: иначе окно продлевалось бы
      // каждым запросом и никогда не закрывалось.
      await client.expire(redisKey, windowSeconds);
    }

    const ttl = await client.ttl(redisKey);
    const allowed = count <= max;

    return {
      allowed,
      remaining: Math.max(0, max - count),
      retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  }
}
