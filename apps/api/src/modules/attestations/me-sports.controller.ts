import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionCode } from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import { MeSportsService } from './me-sports.service';

/**
 * Сводка для родителя (#41).
 *
 * Один запрос вместо «список событий → участники каждого → результаты»: на
 * мобильном сети дороже, чем на сервере, и N+1 здесь недопустим. Сервер уже знает
 * связанных спортсменов и что из результатов опубликовано.
 */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me/sports')
@UseGuards(AuthGuard, PermissionsGuard)
export class MeSportsController {
  constructor(private readonly sports: MeSportsService) {}

  @Get()
  @RequirePermissions(PermissionCode.AttestationsView)
  @ApiOperation({ summary: 'Мероприятия своих детей: аттестации и соревнования' })
  @ApiOkResponse({ description: 'Только свои спортсмены и опубликованные результаты' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.sports.overview(user.id);
  }
}
