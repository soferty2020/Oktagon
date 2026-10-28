import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { HallsController, TrainersController } from './club-structure.controller';
import { ClubStructureRepository, PrismaClubStructureRepository } from './club-structure.repository';
import { ClubStructureService } from './club-structure.service';

/**
 * Структура клуба (issues C1–C3): филиалы, залы, тренеры.
 *
 * Спецификация: docs/00-project-overview.md (три филиала, рост до 5+),
 * docs/22-erd.md (Branch, Hall, TrainerProfile).
 *
 * IdentityModule нужен для PermissionsGuard (`branches.view`,
 * `branches.manage`) и впоследствии для ResourceScopeService.
 */
@Module({
  imports: [IdentityModule],
  controllers: [HallsController, TrainersController],
  providers: [
    ClubStructureService,
    PrismaClubStructureRepository,
    { provide: ClubStructureRepository, useExisting: PrismaClubStructureRepository },
  ],
  exports: [ClubStructureService],
})
export class ClubStructureModule {}
