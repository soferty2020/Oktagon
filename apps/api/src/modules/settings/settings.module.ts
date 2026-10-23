import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { DebtRulesController } from './debt-rules.controller';
import { DebtRulesRepository, PrismaDebtRulesRepository } from './debt-rules.repository';
import { DebtRulesService } from './debt-rules.service';
import { SettingsController } from './settings.controller';
import { PrismaSettingsRepository, SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

/**
 * Настройки клуба (K1, K5, docs/26-admin-settings.md).
 *
 * `IdentityModule` нужен для `SuperadminGuard`: роль читается через
 * `PermissionResolver` (IdentityService), а не из токена — снятие роли должно
 * действовать сразу (ADR-0006).
 *
 * Секретов и инфраструктуры здесь нет: модуль покрывает безопасные параметры
 * (название, логотип, контакты, часовой пояс) и правила расчета задолженности.
 *
 * `DebtRulesService` экспортируется: финансы применяют правило при расчете
 * должников, но не решают, каким оно должно быть (K5, ADR-0014).
 */
@Module({
  imports: [IdentityModule],
  controllers: [SettingsController, DebtRulesController],
  providers: [
    SettingsService,
    PrismaSettingsRepository,
    { provide: SettingsRepository, useExisting: PrismaSettingsRepository },
    DebtRulesService,
    PrismaDebtRulesRepository,
    { provide: DebtRulesRepository, useExisting: PrismaDebtRulesRepository },
  ],
  exports: [SettingsService, DebtRulesService],
})
export class SettingsModule {}
