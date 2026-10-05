import { Module } from '@nestjs/common';

import { FinanceService } from './finance.service';

/**
 * Модуль finance.
 *
 * Спецификация: BR-001..BR-004, BR-010, docs/22-erd.md (MembershipPeriod, PaymentTransaction).
 * Публичный контракт и бизнес-логика добавляются отдельным issue
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Module({
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
