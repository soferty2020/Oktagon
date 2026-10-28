import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionCode, type UserInviteCreated, type UserInviteView } from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import { IdentityService } from '../identity/identity.service';
import { CreateInviteDto, ListInvitesQueryDto } from './invite.dto';
import { InviteService } from './invite.service';
import { RefreshTokenService } from './refresh-token.service';
import { SetUserStatusDto } from './users.dto';

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
  constructor(
    private readonly invites: InviteService,
    private readonly identity: IdentityService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

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

  /**
   * Блокировка и разблокировка аккаунта (#56, SEC-15).
   *
   * Блокировка сразу отзывает все refresh-токены: иначе уволенный сотрудник
   * сохранил бы доступ до истечения сессии, а с refresh — бесконечно.
   */
  @Patch(':id/status')
  @RequirePermissions(PermissionCode.UsersManage)
  @ApiOperation({ summary: 'Заблокировать или разблокировать пользователя' })
  @ApiNoContentResponse({ description: 'Статус изменён; сессии заблокированного отозваны' })
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetUserStatusDto,
  ): Promise<void> {
    await this.identity.setUserStatus(user.id, id, dto.status);

    if (dto.status === 'BLOCKED') {
      await this.refreshTokens.revokeAllForUser(id);
    }
  }
}
