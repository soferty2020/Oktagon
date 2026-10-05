import { Module } from '@nestjs/common';

import { FreezesModule } from '../freezes/freezes.module';
import { IdentityModule } from '../identity/identity.module';
import {
  DebtsController,
  MembershipPeriodsController,
  PaymentsController,
} from './finance.controller';
import { FinanceRepository, PrismaFinanceRepository } from './finance.repository';
import { FinanceService } from './finance.service';

/**
 * Финансы (эпик F, BR-001..BR-004, BR-010).
 *
 * Спецификация: docs/22-erd.md (MembershipPeriod, PaymentTransaction),
 * docs/04-roles-permissions.md, BR-010 (доступ только с явным правом).
 *
 * Заморозки (BR-005) живут в отдельном модуле `freezes`: это самостоятельный
 * сценарий со своими правами. Но задолженность обязана их учитывать (BR-004,
 * условие 4), поэтому FinanceModule получает FreezeRepository из FreezesModule —
 * зависимость односторонняя, обратной нет.
 */
@Module({
  imports: [IdentityModule, FreezesModule],
  controllers: [MembershipPeriodsController, PaymentsController, DebtsController],
  providers: [
    FinanceService,
    PrismaFinanceRepository,
    { provide: FinanceRepository, useExisting: PrismaFinanceRepository },
  ],
  exports: [FinanceService],
})
export class FinanceModule {}
