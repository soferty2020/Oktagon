import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { CertificationEventsController } from './certification-events.controller';
import { CertificationEventsRepository } from './certification-events.repository';
import { CertificationEventsService } from './certification-events.service';
import { ParticipantsController } from './participants.controller';
import { ParticipantsRepository, ResultsRepository } from './participants.repository';
import { ParticipantsService } from './participants.service';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';
import { MeSportsController } from './me-sports.controller';
import { MeSportsService } from './me-sports.service';

/**
 * Аттестации как мероприятия (#33–#35).
 *
 * Отдельный модуль, а не часть `athletes`: у экзамена своя жизнь — дата, статус,
 * список участников, публикация. `athletes` отвечает за карточку спортсмена, и
 * смешивать это значило бы держать в одном модуле две разные оси изменений.
 *
 * `IdentityModule` нужен ради зоны доступа: тренер видит и правит только своих
 * спортсменов, и проверка живёт там же, где остальные проверки доступа.
 */
@Module({
  imports: [PrismaModule, AuditModule, IdentityModule],
  controllers: [
    CertificationEventsController,
    ParticipantsController,
    ResultsController,
    MeSportsController,
  ],
  providers: [
    CertificationEventsRepository,
    CertificationEventsService,
    ParticipantsRepository,
    ParticipantsService,
    ResultsRepository,
    ResultsService,
    MeSportsService,
  ],
  exports: [CertificationEventsService, ParticipantsService, ResultsService],
})
export class AttestationsModule {}
