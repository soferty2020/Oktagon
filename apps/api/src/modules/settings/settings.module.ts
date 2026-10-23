import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { SettingsController } from './settings.controller';
import { PrismaSettingsRepository, SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

/**
 * Настройки клуба (K1, docs/26-admin-settings.md).
 *
 * `IdentityModule` нужен для `SuperadminGuard`: роль читается через
 * `PermissionResolver` (IdentityService), а не из токена — снятие роли должно
 * действовать сразу (ADR-0006).
 *
 * Секретов и инфраструктуры здесь нет: модуль покрывает только безопасные
 * параметры — название, логотип, контакты и часовой пояс.
 */
@Module({
  imports: [IdentityModule],
  controllers: [SettingsController],
  providers: [
    SettingsService,
    PrismaSettingsRepository,
    { provide: SettingsRepository, useExisting: PrismaSettingsRepository },
  ],
  exports: [SettingsService],
})
export class SettingsModule {}
