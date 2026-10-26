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
  CompetitionStatus,
  PermissionCode,
  type CompetitionView,
} from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import { CreateCompetitionDto, UpdateCompetitionDto } from './competitions.dto';
import { CompetitionsService } from './competitions.service';

/**
 * Турниры (#36).
 *
 * Статус меняется отдельными действиями, а не через PATCH: иначе клиент обошёл бы
 * проверку переходов и смог опубликовать незавершённый турнир.
 */
@ApiTags('competitions')
@ApiBearerAuth()
@Controller('competitions')
@UseGuards(AuthGuard, PermissionsGuard)
export class CompetitionsController {
  constructor(private readonly competitions: CompetitionsService) {}

  @Get()
  @RequirePermissions(PermissionCode.CompetitionsView)
  @ApiOperation({ summary: 'Список турниров; фильтр по статусу' })
  @ApiOkResponse({ description: 'Турниры, новые сверху' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ): Promise<CompetitionView[]> {
    const known = Object.values(CompetitionStatus) as string[];
    const filter = status && known.includes(status) ? (status as CompetitionStatus) : undefined;

    return this.competitions.list({ userId: user.id, role: user.role ?? 'MEMBER' }, filter);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.CompetitionsView)
  @ApiOperation({ summary: 'Карточка турнира' })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CompetitionView> {
    return this.competitions.get({ userId: user.id, role: user.role ?? 'MEMBER' }, id);
  }

  @Post()
  @RequirePermissions(PermissionCode.CompetitionsManage)
  @ApiOperation({ summary: 'Создать турнир; создаётся черновиком' })
  @ApiCreatedResponse({ description: 'Созданный турнир' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompetitionDto,
  ): Promise<CompetitionView> {
    return this.competitions.create(user.id, {
      title: dto.title,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt ?? null,
      location: dto.location ?? null,
      organizer: dto.organizer ?? null,
      level: dto.level,
      description: dto.description ?? null,
    });
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.CompetitionsManage)
  @ApiOperation({ summary: 'Изменить турнир (создатель или руководитель)' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompetitionDto,
  ): Promise<CompetitionView> {
    return this.competitions.update(user.id, user.role === 'SUPERADMIN', id, dto);
  }

  @Post(':id/plan')
  @RequirePermissions(PermissionCode.CompetitionsManage)
  @ApiOperation({ summary: 'Черновик → запланировано' })
  async plan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CompetitionView> {
    return this.competitions.transition(user.id, user.role === 'SUPERADMIN', id, 'PLANNED');
  }

  @Post(':id/start')
  @RequirePermissions(PermissionCode.CompetitionsManage)
  @ApiOperation({ summary: 'Запланировано → идёт' })
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CompetitionView> {
    return this.competitions.transition(user.id, user.role === 'SUPERADMIN', id, 'IN_PROGRESS');
  }

  @Post(':id/complete')
  @RequirePermissions(PermissionCode.CompetitionsManage)
  @ApiOperation({ summary: 'Завершить: только когда у всех участий есть итог' })
  async complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CompetitionView> {
    return this.competitions.transition(user.id, user.role === 'SUPERADMIN', id, 'COMPLETED');
  }

  @Post(':id/cancel')
  @RequirePermissions(PermissionCode.CompetitionsManage)
  @ApiOperation({ summary: 'Отменить турнир; результаты и встречи остаются в архиве' })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CompetitionView> {
    return this.competitions.transition(user.id, user.role === 'SUPERADMIN', id, 'CANCELLED');
  }

  @Post(':id/publish')
  @RequirePermissions(PermissionCode.CompetitionsPublish)
  @ApiOperation({ summary: 'Опубликовать результаты; только из COMPLETED' })
  async publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CompetitionView> {
    return this.competitions.publish(user.id, user.role === 'SUPERADMIN', id);
  }
}
