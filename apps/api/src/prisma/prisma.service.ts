import { Global, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { PrismaClient } from '../../generated/prisma';

/**
 * Единственный экземпляр PrismaClient на приложение.
 *
 * Клиент создается лениво в onModuleInit, чтобы к этому моменту конфигурация
 * окружения уже была загружена и провалидирована (DATABASE_URL).
 */
@Global()
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private client?: PrismaClient;

  get db(): PrismaClient {
    if (!this.client) {
      this.client = new PrismaClient();
    }
    return this.client;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.db.$connect();
      this.logger.log('PostgreSQL connection established');
    } catch (error) {
      this.logger.error(
        'PostgreSQL connection failed; API will report 503 on readiness checks',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.$disconnect();
      this.client = undefined;
    }
  }

  /** Проверка доступности БД для readiness-пробы. */
  async isReachable(): Promise<boolean> {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.warn(
        `Database readiness probe failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
