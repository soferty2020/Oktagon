import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionCode, type UserInviteCreated, type UserInviteView } from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import { CreateInviteDto, ListInvitesQueryDto } from './invite.dto';
import { InviteService } from './invite.service';

/**
 * Управление пользователями и приглашениями (B3).
 *
 * Саморегистрации в MVP нет (docs/01-mvp-scope.md): пользователя приглашает
 * администратор. Создание приглашения требует права `users.manage`
 * (docs/04-roles-permissions.md).
 */
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly invites: InviteService) {}

  @Post('invites')
  @RequirePermissions(PermissionCode.UsersManage)
  @ApiOperation({ summary: 'Пригласить пользователя' })
  @ApiCreatedResponse({ description: 'Приглашение создано; token показывается один раз' })
  create(
    @Body() dto: CreateInviteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserInviteCreated> {
    return this.invites.create({ email: dto.email, role: dto.role, createdBy: user.id });
  }

  @Get('invites')
  @RequirePermissions(PermissionCode.UsersManage)
  @ApiOperation({ summary: 'Действующие приглашения' })
  @ApiOkResponse({ description: 'Список непринятых приглашений' })
  list(@Query() query: ListInvitesQueryDto): Promise<UserInviteView[]> {
    return this.invites.listPending(query.email);
  }
}
