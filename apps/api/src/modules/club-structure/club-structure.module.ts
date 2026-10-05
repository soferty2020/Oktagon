import { Module } from '@nestjs/common';

import { ClubStructureService } from './club-structure.service';

/**
 * Модуль club-structure.
 *
 * Спецификация: docs/00-project-overview.md (3 филиала, рост до 5+), docs/22-erd.md (Branch, Hall, TrainerProfile).
 * Публичный контракт и бизнес-логика добавляются отдельным issue
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Module({
  providers: [ClubStructureService],
  exports: [ClubStructureService],
})
export class ClubStructureModule {}
