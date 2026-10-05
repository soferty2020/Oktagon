import { Injectable } from '@nestjs/common';

/**
 * Заготовка модуля scheduling.
 *
 * Спецификация: docs/01-mvp-scope.md (квартальное расписание, точечные переносы), BR-009, docs/22-erd.md (ScheduleTemplate, TrainingSession).
 * Публичный контракт модуля согласуется до реализации
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Injectable()
export class SchedulingService {}
