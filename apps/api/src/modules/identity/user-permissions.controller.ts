import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
  type UserPermissionGrant,
  type UserPermissionsView,
} from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import { GrantPermissionDto } from './permission.dto';
import { PermissionGrantService } from './permission-grant.service';

/**
 * Индивидуальные права пользователя (issue B5).
 *
 * Спецификация: docs/04-roles-permissions.md (permissions поверх роли),
 * docs/21-permission-matrix.md, BR-007 (изменения прав аудируются).
 *
 * Все маршруты требуют право `permissions.manage`.
 */
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('users/:userId/permissions')
export class UserPermissionsController {
  constructor(private readonly grants: PermissionGrantService) {}

  @Get()
  @RequirePermissions(PermissionCode.PermissionsManage)
  @ApiOperation({ summary: 'Права пользователя: ролевые, выданные лично и итоговые' })
  @ApiOkResponse({ description: 'Состояние прав пользователя' })
  list(@Param('userId') userId: string): Promise<UserPermissionsView> {
    return this.grants.listForUser(userId);
  }

  @Post()
  @RequirePermissions(PermissionCode.PermissionsManage)
  @ApiOperation({ summary: 'Выдать пользователю индивидуальное право' })
  @ApiCreatedResponse({ description: 'Право выдано' })
  grant(
    @Param('userId') userId: string,
    @Body() dto: GrantPermissionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserPermissionGrant> {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    return this.grants.grant(userId, dto.code, actor.id, expiresAt);
  }

  @Delete(':code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PermissionCode.PermissionsManage)
  @ApiOperation({ summary: 'Отозвать индивидуально выданное право' })
  @ApiNoContentResponse({ description: 'Право отозвано' })
  async revoke(
    @Param('userId') userId: string,
    @Param('code') code: PermissionCode,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.grants.revoke(userId, code, actor.id);
  }
}
