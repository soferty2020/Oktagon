import { Module } from '@nestjs/common';

import { SchedulingService } from './scheduling.service';

/**
 * Модуль scheduling.
 *
 * Спецификация: docs/01-mvp-scope.md (квартальное расписание, точечные переносы), BR-009, docs/22-erd.md (ScheduleTemplate, TrainingSession).
 * Публичный контракт и бизнес-логика добавляются отдельным issue
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Module({
  providers: [SchedulingService],
  exports: [SchedulingService],
})
export class SchedulingModule {}
