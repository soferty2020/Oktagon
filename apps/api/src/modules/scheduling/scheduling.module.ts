import { Module } from '@nestjs/common';

import { GroupsModule } from '../groups/groups.module';
import { IdentityModule } from '../identity/identity.module';
import { ScheduleTemplatesController, TrainingSessionsController } from './scheduling.controller';
import { PrismaSchedulingRepository, SchedulingRepository } from './scheduling.repository';
import { SchedulingService } from './scheduling.service';

/**
 * Расписание (эпик D): квартальные шаблоны, материализация занятий, точечные
 * изменения.
 *
 * Спецификация: docs/01-mvp-scope.md (квартальное расписание, точечные
 * переносы), BR-009 (точечное изменение экземпляра не меняет шаблон),
 * docs/22-erd.md (ScheduleTemplate, ScheduleTemplateSlot, TrainingSession),
 * ADR-0009.
 *
 * Зависимости: IdentityModule дает PermissionsGuard (`schedule.view`,
 * `schedule.edit`, `schedule.cancel`) и ResourceScopeService — список
 * расписания ограничен зоной видимости. GroupsModule дает проверку
 * существования группы и ее основной филиал, который наследуется занятием.
 */
@Module({
  imports: [IdentityModule, GroupsModule],
  controllers: [ScheduleTemplatesController, TrainingSessionsController],
  providers: [
    SchedulingService,
    PrismaSchedulingRepository,
    { provide: SchedulingRepository, useExisting: PrismaSchedulingRepository },
  ],
  exports: [SchedulingService],
})
export class SchedulingModule {}
