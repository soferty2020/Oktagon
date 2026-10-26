import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CertificationEventStatus,
  PermissionCode,
  type CertificationEventView,
} from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import { CreateCertificationEventDto, UpdateCertificationEventDto } from './certification-events.dto';
import { CertificationEventsService } from './certification-events.service';

/**
 * Мероприятия аттестаций (#33).
 *
 * Статус меняется отдельными действиями, а не через PATCH: иначе клиент обошёл бы
 * проверку переходов.
 */
@ApiTags('certification-events')
@ApiBearerAuth()
@Controller('certification-events')
@UseGuards(AuthGuard, PermissionsGuard)
export class CertificationEventsController {
  constructor(private readonly events: CertificationEventsService) {}

  @Get()
  @RequirePermissions(PermissionCode.AttestationsView)
  @ApiOperation({ summary: 'Список мероприятий; фильтр по статусу' })
  @ApiOkResponse({ description: 'Мероприятия, новые сверху' })
  async list(
    @Query('status') status?: string,
  ): Promise<CertificationEventView[]> {
    const known = Object.values(CertificationEventStatus) as string[];
    const filter = status && known.includes(status) ? (status as CertificationEventStatus) : undefined;

    return this.events.list(filter);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.AttestationsView)
  @ApiOperation({ summary: 'Карточка мероприятия' })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<CertificationEventView> {
    return this.events.get(id);
  }

  @Post()
  @RequirePermissions(PermissionCode.AttestationsManage)
  @ApiOperation({ summary: 'Создать мероприятие; создаётся черновиком' })
  @ApiCreatedResponse({ description: 'Созданное мероприятие' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCertificationEventDto,
  ): Promise<CertificationEventView> {
    return this.events.create(user.id, {
      title: dto.title,
      scheduledAt: dto.scheduledAt,
      location: dto.location ?? null,
      organizer: dto.organizer ?? null,
      description: dto.description ?? null,
    });
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.AttestationsManage)
  @ApiOperation({ summary: 'Изменить мероприятие (создатель или руководитель)' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCertificationEventDto,
  ): Promise<CertificationEventView> {
    return this.events.update(user.id, user.role === 'SUPERADMIN', id, dto);
  }

  @Post(':id/plan')
  @RequirePermissions(PermissionCode.AttestationsManage)
  @ApiOperation({ summary: 'Черновик → запланировано' })
  async plan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CertificationEventView> {
    return this.events.transition(user.id, user.role === 'SUPERADMIN', id, 'PLANNED');
  }

  @Post(':id/start')
  @RequirePermissions(PermissionCode.AttestationsManage)
  @ApiOperation({ summary: 'Запланировано → идёт' })
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CertificationEventView> {
    return this.events.transition(user.id, user.role === 'SUPERADMIN', id, 'IN_PROGRESS');
  }

  @Post(':id/complete')
  @RequirePermissions(PermissionCode.AttestationsManage)
  @ApiOperation({ summary: 'Завершить: только когда у всех участников есть итог' })
  async complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CertificationEventView> {
    return this.events.transition(user.id, user.role === 'SUPERADMIN', id, 'COMPLETED');
  }

  @Post(':id/cancel')
  @RequirePermissions(PermissionCode.AttestationsManage)
  @ApiOperation({ summary: 'Отменить мероприятие; результаты остаются в архиве' })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CertificationEventView> {
    return this.events.transition(user.id, user.role === 'SUPERADMIN', id, 'CANCELLED');
  }

  @Post(':id/publish')
  @RequirePermissions(PermissionCode.AttestationsPublish)
  @ApiOperation({ summary: 'Опубликовать результаты; только из COMPLETED' })
  async publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CertificationEventView> {
    return this.events.publish(user.id, user.role === 'SUPERADMIN', id);
  }
}
