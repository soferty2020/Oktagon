import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { AthletesController } from './athletes.controller';
import { AthletesRepository, PrismaAthletesRepository } from './athletes.repository';
import { AthletesService } from './athletes.service';
import { BeltGradesController } from './belt-grades.controller';
import { CertificationCancelController, CertificationsController } from './certifications.controller';
import {
  CertificationsRepository,
  PrismaCertificationsRepository,
} from './certifications.repository';
import { CertificationsService } from './certifications.service';

/**
 * Спортсмены, связи с аккаунтами и справочник поясов (issues C4–C5, K3).
 *
 * Спецификация: docs/07-domain-model.md, docs/22-erd.md (Athlete, UserAthlete),
 * docs/00-project-overview.md (аккаунт не равен карточке спортсмена),
 * BR-015 (фиксированный справочник поясов).
 *
 * IdentityModule дает PermissionsGuard, ResourceScopeService (влияет на
 * выборку) и PermissionResolver (видимость контактов).
 *
 * BeltGradesController живет здесь, а не в settings: справочник — часть
 * карточки спортсмена, и отдельный модуль ради одного read-only маршрута был бы
 * лишним слоем.
 */
@Module({
  imports: [IdentityModule],
  controllers: [AthletesController, BeltGradesController, CertificationsController, CertificationCancelController],
  providers: [
    AthletesService,
    PrismaAthletesRepository,
    { provide: AthletesRepository, useExisting: PrismaAthletesRepository },
    CertificationsService,
    PrismaCertificationsRepository,
    { provide: CertificationsRepository, useExisting: PrismaCertificationsRepository },
  ],
  exports: [AthletesService],
})
export class AthletesModule {}
