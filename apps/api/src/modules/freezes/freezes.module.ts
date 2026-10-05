import { Module } from '@nestjs/common';

import { FreezesService } from './freezes.service';

/**
 * Модуль freezes.
 *
 * Спецификация: BR-005, docs/08-database.md (один открытый период на спортсмена), docs/22-erd.md (FreezePeriod).
 * Публичный контракт и бизнес-логика добавляются отдельным issue
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Module({
  providers: [FreezesService],
  exports: [FreezesService],
})
export class FreezesModule {}
