import { Module } from '@nestjs/common';

import { AnalyticsService } from './analytics.service';

/**
 * Модуль analytics.
 *
 * Спецификация: docs/17-acceptance-criteria.md (dashboard по филиалам), docs/01-mvp-scope.md (dashboard руководителя).
 * Публичный контракт и бизнес-логика добавляются отдельным issue
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
