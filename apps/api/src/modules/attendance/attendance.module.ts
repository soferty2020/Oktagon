import { Module } from '@nestjs/common';

import { AttendanceService } from './attendance.service';

/**
 * Модуль attendance.
 *
 * Спецификация: BR-008, docs/16-testing.md (attendance edit), docs/22-erd.md (Attendance, PlannedAbsence).
 * Публичный контракт и бизнес-логика добавляются отдельным issue
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Module({
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
