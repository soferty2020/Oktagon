import { Module } from '@nestjs/common';

import { FreezesModule } from '../freezes/freezes.module';
import { IdentityModule } from '../identity/identity.module';
import { SettingsModule } from '../settings/settings.module';
import {
  DebtRulesPreviewController,
  DebtsController,
  FinanceSummaryController,
  MembershipPeriodActionsController,
  MembershipPeriodsController,
  PaymentsController,
  RefundsController,
} from './finance.controller';
import { FinanceRepository, PrismaFinanceRepository } from './finance.repository';
import { FinanceService } from './finance.service';

/**
 * Финансы (эпик F, BR-001..BR-004, BR-010, ADR-0010, K5).
 *
 * Спецификация: docs/22-erd.md (MembershipPeriod, PaymentTransaction),
 * docs/04-roles-permissions.md, BR-010 (доступ только с явным правом),
 * ADR-0014 (настраиваемые правила долга).
 *
 * Заморозки (BR-005) живут в отдельном модуле `freezes`: это самостоятельный
 * сценарий со своими правами. Но задолженность обязана их учитывать (BR-004,
 * условие 4), поэтому FinanceModule получает FreezeRepository из FreezesModule —
 * зависимость односторонняя, обратной нет.
 *
 * `SettingsModule` дает DebtRulesService: финансы применяют правило, но не решают,
 * каким оно должно быть. Preview новых правил живет здесь, потому что для него
 * нужны данные периодов, заморозок и занятий.
 */
@Module({
  imports: [IdentityModule, FreezesModule, SettingsModule],
  controllers: [
    MembershipPeriodsController,
    MembershipPeriodActionsController,
    PaymentsController,
    RefundsController,
    DebtsController,
    FinanceSummaryController,
    DebtRulesPreviewController,
  ],
  providers: [
    FinanceService,
    PrismaFinanceRepository,
    { provide: FinanceRepository, useExisting: PrismaFinanceRepository },
  ],
  exports: [FinanceService],
})
export class FinanceModule {}
