import { Module } from '@nestjs/common';

import { GroupsModule } from '../groups/groups.module';
import { IdentityModule } from '../identity/identity.module';
import {
  AttendanceSummaryController,
  SessionAttendanceController,
} from './attendance.controller';
import { AttendanceRepository, PrismaAttendanceRepository } from './attendance.repository';
import { AttendanceService } from './attendance.service';

/**
 * Посещаемость (эпик E).
 *
 * Спецификация: BR-008 (родитель сообщает о планируемом отсутствии; итог
 * подтверждает тренер), docs/22-erd.md (Attendance, PlannedAbsence),
 * docs/01-mvp-scope.md.
 *
 * Зависимости: IdentityModule дает PermissionsGuard (`attendance.view`,
 * `attendance.edit`) и ResourceScopeService; GroupsModule — состав группы на
 * дату занятия, по которому строится журнал.
 */
@Module({
  imports: [IdentityModule, GroupsModule],
  controllers: [SessionAttendanceController, AttendanceSummaryController],
  providers: [
    AttendanceService,
    PrismaAttendanceRepository,
    { provide: AttendanceRepository, useExisting: PrismaAttendanceRepository },
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
