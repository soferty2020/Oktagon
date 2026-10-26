import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { CompetitionsController } from './competitions.controller';
import { CompetitionsRepository } from './competitions.repository';
import { CompetitionsService } from './competitions.service';
import { CompetitionEntriesService } from './competition-entries.service';
import { EntriesRepository } from './entries.repository';
import {
  CompetitionCategoriesController,
  CompetitionParticipantsController,
  CompetitionResultsController,
} from './entries.controller';

/**
 * Соревнования (#36–#38).
 *
 * Отдельный модуль, а не часть `athletes`: турнир — мероприятие с собственным
 * жизненным циклом, категориями и результатами. Карточка спортсмена только
 * показывает их.
 */
@Module({
  imports: [PrismaModule, AuditModule, IdentityModule],
  controllers: [
    // Категории объявлены раньше турниров: `GET /competitions/categories` иначе
    // перехватывается маршрутом `GET /competitions/:id` и падает на валидации
    // UUID — то есть категории нельзя прочитать, хотя создать можно.
    CompetitionCategoriesController,
    CompetitionsController,
    CompetitionParticipantsController,
    CompetitionResultsController,
  ],
  providers: [CompetitionsRepository, CompetitionsService, EntriesRepository, CompetitionEntriesService],
  exports: [CompetitionsService, CompetitionEntriesService],
})
export class CompetitionsModule {}
