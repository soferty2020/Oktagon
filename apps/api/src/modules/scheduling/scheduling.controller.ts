import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  PermissionCode,
  type GenerateSessionsResult,
  type ScheduleTemplateView,
  type TrainingSessionView,
} from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import {
  AddScheduleSlotDto,
  CancelSessionDto,
  CreateScheduleTemplateDto,
  CreateSessionDto,
  GenerateSessionsDto,
  ListSessionsQueryDto,
  ListTemplatesQueryDto,
  MoveSessionDto,
  UpdateScheduleSlotDto,
} from './scheduling.dto';
import { SchedulingService } from './scheduling.service';

/**
 * Квартальные шаблоны расписания (эпик D).
 *
 * Спецификация: docs/01-mvp-scope.md, BR-009, ADR-0009.
 *
 * Просмотр требует `schedule.view`, изменение — `schedule.edit`. Публикация
 * фиксирует шаблон: после нее слоты не меняются, изменения вносятся точечно.
 */
@ApiTags('schedule')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('schedule-templates')
export class ScheduleTemplatesController {
  constructor(private readonly schedule: SchedulingService) {}

  @Get()
  @RequirePermissions(PermissionCode.ScheduleView)
  @ApiOperation({ summary: 'Шаблоны расписания в зоне видимости вызывающего' })
  @ApiOkResponse({ description: 'Список шаблонов со слотами' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTemplatesQueryDto,
  ): Promise<ScheduleTemplateView[]> {
    return this.schedule.listTemplates(user.id, { groupId: query.groupId, year: query.year });
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.ScheduleView)
  @ApiOperation({ summary: 'Шаблон расписания' })
  @ApiOkResponse({ description: 'Шаблон со слотами' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ScheduleTemplateView> {
    return this.schedule.getTemplate(user.id, id);
  }

  @Post()
  @RequirePermissions(PermissionCode.ScheduleEdit)
  @ApiOperation({ summary: 'Создать шаблон на квартал' })
  @ApiCreatedResponse({ description: 'Шаблон создан' })
  create(@Body() dto: CreateScheduleTemplateDto): Promise<ScheduleTemplateView> {
    return this.schedule.createTemplate({
      groupId: dto.groupId,
      year: dto.year,
      quarter: dto.quarter,
    });
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.ScheduleEdit)
  @ApiOperation({ summary: 'Опубликовать расписание' })
  @ApiOkResponse({ description: 'Шаблон опубликован и зафиксирован' })
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ScheduleTemplateView> {
    return this.schedule.publishTemplate(user.id, id);
  }

  @Post(':id/generate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.ScheduleEdit)
  @ApiOperation({ summary: 'Материализовать занятия квартала из шаблона' })
  @ApiOkResponse({ description: 'Сколько занятий создано, пропущено и удалено' })
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GenerateSessionsDto,
  ): Promise<GenerateSessionsResult> {
    return this.schedule.generateSessions(user.id, { templateId: id, regenerate: dto.regenerate });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PermissionCode.ScheduleEdit)
  @ApiOperation({ summary: 'Удалить неопубликованный шаблон' })
  @ApiNoContentResponse({ description: 'Шаблон удален' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.schedule.deleteTemplate(user.id, id);
  }

  // --- Слоты ---------------------------------------------------------------

  @Post(':id/slots')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.ScheduleEdit)
  @ApiOperation({ summary: 'Добавить слот в шаблон' })
  @ApiOkResponse({ description: 'Шаблон с обновленными слотами' })
  addSlot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddScheduleSlotDto,
  ): Promise<ScheduleTemplateView> {
    return this.schedule.addSlot(user.id, id, {
      weekday: dto.weekday,
      startTime: dto.startTime,
      endTime: dto.endTime,
      hallId: dto.hallId ?? null,
      trainerId: dto.trainerId ?? null,
    });
  }

  @Patch(':id/slots/:slotId')
  @RequirePermissions(PermissionCode.ScheduleEdit)
  @ApiOperation({ summary: 'Изменить слот (только до публикации)' })
  @ApiOkResponse({ description: 'Шаблон с обновленными слотами' })
  updateSlot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slotId') slotId: string,
    @Body() dto: UpdateScheduleSlotDto,
  ): Promise<ScheduleTemplateView> {
    return this.schedule.updateSlot(user.id, slotId, dto);
  }

  @Delete(':id/slots/:slotId')
  @RequirePermissions(PermissionCode.ScheduleEdit)
  @ApiOperation({ summary: 'Удалить слот (только до публикации)' })
  @ApiOkResponse({ description: 'Шаблон с обновленными слотами' })
  deleteSlot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slotId') slotId: string,
  ): Promise<ScheduleTemplateView> {
    return this.schedule.deleteSlot(user.id, slotId);
  }
}

/**
 * Занятия: материализованные экземпляры расписания.
 *
 * Точечные изменения применяются к одному занятию и требуют причины: шаблон при
 * этом не меняется (BR-009).
 */
@ApiTags('training-sessions')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('training-sessions')
export class TrainingSessionsController {
  constructor(private readonly schedule: SchedulingService) {}

  @Get()
  @RequirePermissions(PermissionCode.ScheduleView)
  @ApiOperation({ summary: 'Занятия за период (по умолчанию 30 дней вперед)' })
  @ApiOkResponse({ description: 'Список занятий' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSessionsQueryDto,
  ): Promise<TrainingSessionView[]> {
    return this.schedule.listSessions(user.id, {
      from: query.from,
      to: query.to,
      groupId: query.groupId,
      trainerId: query.trainerId,
      status: query.status,
    });
  }

  @Post()
  @RequirePermissions(PermissionCode.ScheduleEdit)
  @ApiOperation({ summary: 'Добавить занятие вручную' })
  @ApiCreatedResponse({ description: 'Занятие создано' })
  create(@Body() dto: CreateSessionDto): Promise<TrainingSessionView> {
    return this.schedule.createSession({
      groupId: dto.groupId,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      hallId: dto.hallId ?? null,
      trainerId: dto.trainerId ?? null,
      reason: dto.reason,
    });
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.ScheduleView)
  @ApiOperation({ summary: 'Занятие' })
  @ApiOkResponse({ description: 'Карточка занятия' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<TrainingSessionView> {
    return this.schedule.getSession(user.id, id);
  }

  @Patch(':id/move')
  @RequirePermissions(PermissionCode.ScheduleEdit)
  @ApiOperation({ summary: 'Перенести занятие (шаблон не меняется)' })
  @ApiOkResponse({ description: 'Занятие перенесено' })
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MoveSessionDto,
  ): Promise<TrainingSessionView> {
    return this.schedule.moveSession(user.id, id, {
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      hallId: dto.hallId,
      trainerId: dto.trainerId,
      reason: dto.reason,
    });
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.ScheduleCancel)
  @ApiOperation({ summary: 'Отменить занятие' })
  @ApiOkResponse({ description: 'Занятие отменено' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelSessionDto,
  ): Promise<TrainingSessionView> {
    return this.schedule.cancelSession(user.id, id, { reason: dto.reason });
  }
}
