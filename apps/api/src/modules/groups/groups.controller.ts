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
  type ActiveMembershipView,
  type GroupDetails,
  type GroupView,
} from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import {
  AddGroupMemberDto,
  AssignGroupTrainerDto,
  CreateGroupDto,
  ListGroupsQueryDto,
  UpdateGroupDto,
} from './groups.dto';
import { GroupsService } from './groups.service';

/**
 * Группы и связи: филиалы, тренеры, состав (issues C6–C8).
 *
 * Спецификация: docs/22-erd.md, docs/00-project-overview.md,
 * docs/04-roles-permissions.md (`groups.view`, `groups.edit`),
 * docs/08-database.md (одна активная GroupMembership на спортсмена).
 *
 * Права дополняются проверкой scope: тренер видит и меняет только свои группы
 * (docs/21-permission-matrix.md, Enforcement).
 */
@ApiTags('groups')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  @RequirePermissions(PermissionCode.GroupsView)
  @ApiOperation({ summary: 'Группы в зоне видимости вызывающего' })
  @ApiOkResponse({ description: 'Список групп с числом активных участников' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListGroupsQueryDto,
  ): Promise<GroupView[]> {
    return this.groups.list(user.id, { isActive: query.isActive, search: query.search });
  }

  @Get('by-athlete/:athleteId')
  @RequirePermissions(PermissionCode.GroupsView)
  @ApiOperation({ summary: 'Действующая группа спортсмена' })
  @ApiOkResponse({ description: 'Активное членство либо null' })
  activeMembership(@Param('athleteId') athleteId: string): Promise<ActiveMembershipView | null> {
    return this.groups.getActiveMembership(athleteId);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.GroupsView)
  @ApiOperation({ summary: 'Группа с филиалами, тренерами и составом' })
  @ApiOkResponse({ description: 'Детали группы' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<GroupDetails> {
    return this.groups.get(user.id, id);
  }

  @Post()
  @RequirePermissions(PermissionCode.GroupsEdit)
  @ApiOperation({ summary: 'Создать группу' })
  @ApiCreatedResponse({ description: 'Группа создана' })
  create(@Body() dto: CreateGroupDto): Promise<GroupView> {
    return this.groups.create({
      name: dto.name,
      description: dto.description ?? null,
      hallId: dto.hallId ?? null,
    });
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.GroupsEdit)
  @ApiOperation({ summary: 'Изменить группу' })
  @ApiOkResponse({ description: 'Группа обновлена' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ): Promise<GroupDetails> {
    return this.groups.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PermissionCode.GroupsEdit)
  @ApiOperation({ summary: 'Архивировать группу (мягкое удаление)' })
  @ApiNoContentResponse({ description: 'Группа архивирована' })
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.groups.archive(user.id, id);
  }

  // --- Тренеры группы ------------------------------------------------------

  @Post(':id/trainers')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.GroupsEdit)
  @ApiOperation({ summary: 'Назначить тренера на группу' })
  @ApiOkResponse({ description: 'Группа с обновленными тренерами' })
  assignTrainer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignGroupTrainerDto,
  ): Promise<GroupDetails> {
    return this.groups.assignTrainer(user.id, id, {
      trainerId: dto.trainerId,
      isPrimary: dto.isPrimary,
    });
  }

  @Delete(':id/trainers/:trainerId')
  @RequirePermissions(PermissionCode.GroupsEdit)
  @ApiOperation({ summary: 'Снять тренера с группы' })
  @ApiOkResponse({ description: 'Группа с обновленными тренерами' })
  unassignTrainer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('trainerId') trainerId: string,
  ): Promise<GroupDetails> {
    return this.groups.unassignTrainer(user.id, id, trainerId);
  }

  // --- Состав группы -------------------------------------------------------

  @Post(':id/members')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.GroupsEdit)
  @ApiOperation({ summary: 'Добавить спортсмена в группу' })
  @ApiOkResponse({ description: 'Группа с обновленным составом' })
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddGroupMemberDto,
  ): Promise<GroupDetails> {
    return this.groups.addMember(user.id, id, {
      athleteId: dto.athleteId,
      joinedAt: dto.joinedAt ?? null,
    });
  }

  @Delete(':id/members/:athleteId')
  @RequirePermissions(PermissionCode.GroupsEdit)
  @ApiOperation({ summary: 'Завершить членство спортсмена' })
  @ApiOkResponse({ description: 'Группа с обновленным составом' })
  endMembership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('athleteId') athleteId: string,
  ): Promise<GroupDetails> {
    return this.groups.endMembership(user.id, id, athleteId);
  }
}
