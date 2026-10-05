import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { type AppEnvironment, loadEnvironment } from '@octagon/config';

/**
 * Конфигурация приложения: валидация переменных окружения на старте
 * (docs/13-architecture.md — packages/config, docs/15-security.md — без секретов в git).
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validate: (raw: Record<string, unknown>) =>
        loadEnvironment(raw as Record<string, string | undefined>),
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}

/** Типизированный доступ к конфигурации в сервисах. */
export type { AppEnvironment };
