import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { AthletesController } from './athletes.controller';
import { AthletesRepository, PrismaAthletesRepository } from './athletes.repository';
import { AthletesService } from './athletes.service';

/**
 * Спортсмены и связи с аккаунтами (issues C4–C5).
 *
 * Спецификация: docs/07-domain-model.md, docs/22-erd.md (Athlete, UserAthlete),
 * docs/00-project-overview.md (аккаунт не равен карточке спортсмена).
 *
 * IdentityModule дает PermissionsGuard, ResourceScopeService (влияет на
 * выборку) и PermissionResolver (видимость контактов).
 */
@Module({
  imports: [IdentityModule],
  controllers: [AthletesController],
  providers: [
    AthletesService,
    PrismaAthletesRepository,
    { provide: AthletesRepository, useExisting: PrismaAthletesRepository },
  ],
  exports: [AthletesService],
})
export class AthletesModule {}
