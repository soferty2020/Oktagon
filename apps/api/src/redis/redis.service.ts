import { Global, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import type { AppEnvironment } from '@octagon/config';

/**
 * Клиент Redis (docs/14-infrastructure.md).
 *
 * Redis нужен для rate limiting auth-эндпоинтов (docs/15-security.md) и
 * кэша/очередей. Подключение ленивое: отсутствие Redis не мешает приложению
 * подняться, но readiness-проба сообщит о проблеме.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private connection?: Redis;

  constructor(private readonly config: ConfigService<AppEnvironment, true>) {}

  /** URL Redis из конфигурации или undefined, если он не задан. */
  get configuredUrl(): string | undefined {
    return this.config.get('REDIS_URL', { infer: true });
  }

  get isConfigured(): boolean {
    return Boolean(this.configuredUrl);
  }

  /**
   * Клиент Redis. Бросает исключение, если REDIS_URL не задан: вызывающий код
   * обязан сначала проверить isConfigured.
   */
  get client(): Redis {
    const url = this.configuredUrl;
    if (!url) {
      throw new Error('REDIS_URL не задан: Redis не сконфигурирован');
    }

    let client = this.connection;
    if (!client) {
      client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        // Не подключаться бесконечно: локальная разработка и CI должны
        // получать ошибку, а не зависать.
        retryStrategy: (attempt) => (attempt > 5 ? null : Math.min(attempt * 200, 1000)),
      });
      client.on('error', (error: Error) => {
        this.logger.warn(`Ошибка Redis: ${error.message}`);
      });
      this.connection = client;
    }

    return client;
  }

  /** Проверка доступности Redis для readiness-пробы. */
  async isReachable(): Promise<boolean> {
    if (!this.isConfigured) {
      return true;
    }

    try {
      const reply = await this.client.ping();
      return reply === 'PONG';
    } catch (error) {
      this.logger.warn(
        `Redis недоступен: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connection) {
      // disconnect() вместо quit(): не ждем сетевого round-trip при остановке.
      this.connection.disconnect();
      this.connection = undefined;
    }
  }
}

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
