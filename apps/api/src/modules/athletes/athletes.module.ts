import { Module } from '@nestjs/common';

import { AthletesService } from './athletes.service';

/**
 * Модуль athletes.
 *
 * Спецификация: docs/07-domain-model.md, docs/22-erd.md (Athlete, UserAthlete), docs/00-project-overview.md (аккаунт != карточка спортсмена).
 * Публичный контракт и бизнес-логика добавляются отдельным issue
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Module({
  providers: [AthletesService],
  exports: [AthletesService],
})
export class AthletesModule {}
