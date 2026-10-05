import { Injectable } from '@nestjs/common';

/**
 * Заготовка модуля finance.
 *
 * Спецификация: BR-001..BR-004, BR-010, docs/22-erd.md (MembershipPeriod, PaymentTransaction).
 * Публичный контракт модуля согласуется до реализации
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Injectable()
export class FinanceService {}
