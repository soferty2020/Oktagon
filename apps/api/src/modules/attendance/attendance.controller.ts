import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiErrorCode,
  PermissionCode,
  type AthleteAttendanceHistoryEntry,
  type AthleteAttendanceSummary,
  type SessionAttendanceView,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import {
  AthleteHistoryQueryDto,
  AttendanceSummaryQueryDto,
  ReportPlannedAbsenceDto,
  SaveAttendanceDto,
} from './attendance.dto';
import { AttendanceService } from './attendance.service';

/**
 * Посещаемость (эпик E).
 *
 * Спецификация: BR-008 (родитель сообщает о планируемом отсутствии; итог
 * подтверждает тренер), docs/01-mvp-scope.md, docs/21-permission-matrix.md.
 *
 * Просмотр требует `attendance.view`, отметка — `attendance.edit`. Оба
 * дополняются проверкой scope: тренер отмечает только свои группы.
 */
@ApiTags('attendance')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('training-sessions/:sessionId/attendance')
export class SessionAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  @RequirePermissions(PermissionCode.AttendanceView)
  @ApiOperation({ summary: 'Список на занятие: состав, отметки и предупреждения' })
  @ApiOkResponse({ description: 'Состав группы на дату занятия со статусами' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
  ): Promise<SessionAttendanceView> {
    return this.attendance.getSessionAttendance(user.id, sessionId);
  }

  @Put()
  @RequirePermissions(PermissionCode.AttendanceEdit)
  @ApiOperation({ summary: 'Отметить посещаемость' })
  @ApiOkResponse({ description: 'Журнал занятия после сохранения' })
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: SaveAttendanceDto,
  ): Promise<SessionAttendanceView> {
    return this.attendance.saveAttendance(user.id, sessionId, {
      marks: dto.marks.map((mark) => ({
        athleteId: mark.athleteId,
        status: mark.status,
        comment: mark.comment ?? null,
      })),
    });
  }

  /**
   * Снимает отметку.
   *
   * Нужно, когда спортсмена отметили по ошибке: удалить запись честнее, чем
   * оставить неверный статус.
   */
  @Delete(':athleteId')
  @RequirePermissions(PermissionCode.AttendanceEdit)
  @ApiOperation({ summary: 'Снять отметку спортсмена' })
  @ApiOkResponse({ description: 'Журнал занятия после снятия отметки' })
  async reset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Param('athleteId') athleteId: string,
  ): Promise<SessionAttendanceView> {
    return this.attendance.resetAttendance(user.id, sessionId, athleteId);
  }

  @Post('planned-absence')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.AttendanceView)
  @ApiOperation({ summary: 'Сообщить о планируемом отсутствии (BR-008)' })
  @ApiOkResponse({ description: 'Предупреждение сохранено; итог подтверждает тренер' })
  reportAbsence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: ReportPlannedAbsenceDto,
  ): Promise<SessionAttendanceView> {
    return this.attendance.reportPlannedAbsence(user.id, sessionId, {
      athleteId: dto.athleteId,
      reason: dto.reason ?? null,
    });
  }

  @Delete('planned-absence/:athleteId')
  @RequirePermissions(PermissionCode.AttendanceView)
  @ApiOperation({ summary: 'Отменить предупреждение об отсутствии' })
  @ApiOkResponse({ description: 'Предупреждение снято' })
  cancelAbsence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Param('athleteId') athleteId: string,
  ): Promise<SessionAttendanceView> {
    return this.attendance.cancelPlannedAbsence(user.id, sessionId, athleteId);
  }
}

/** Сводка посещаемости за период. */
@ApiTags('attendance')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('attendance')
export class AttendanceSummaryController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('summary')
  @RequirePermissions(PermissionCode.AttendanceView)
  @ApiOperation({ summary: 'Сводка посещаемости группы за период' })
  @ApiOkResponse({ description: 'Посещения и пропуски по каждому спортсмену' })
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceSummaryQueryDto,
  ): Promise<AthleteAttendanceSummary[]> {
    if (!query.groupId) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Укажите группу: сводка строится по группе за период',
      );
    }

    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 86_400_000);

    return this.attendance.summary(user.id, query.groupId, from, to);
  }

  /**
   * История посещений спортсмена.
   *
   * Нужна мобильному экрану «Посещаемость»: сводка отдает проценты, но по ней
   * нельзя ответить, был ли ребенок на конкретном занятии.
   */
  @Get('athletes/:athleteId')
  @RequirePermissions(PermissionCode.AttendanceView)
  @ApiOperation({ summary: 'История посещений спортсмена за период' })
  @ApiOkResponse({ description: 'Отметки по занятиям, от новых к старым' })
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('athleteId') athleteId: string,
    @Query() query: AthleteHistoryQueryDto,
  ): Promise<AthleteAttendanceHistoryEntry[]> {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 90 * 86_400_000);

    return this.attendance.history(user.id, athleteId, from, to);
  }
}
