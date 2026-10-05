import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionCode, type FreezeView } from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import { CloseFreezeDto, CreateFreezeDto } from './freezes.dto';
import { FreezesService } from './freezes.service';

/**
 * Заморозки (эпик F, BR-005).
 *
 * Спецификация: BR-005 (открытый период приостановления; начало и завершение
 * можно внести задним числом), docs/08-database.md (один открытый период на
 * спортсмена), BR-010 (финансово значимые данные — только с явным правом).
 *
 * Заморозка освобождает от задолженности (BR-004, условие 4), поэтому права
 * отдельные: `freezes.view` / `freezes.edit`. Тренер их не имеет.
 */
@ApiTags('freezes')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('athletes/:athleteId/freezes')
export class FreezesController {
  constructor(private readonly freezes: FreezesService) {}

  @Get()
  @RequirePermissions(PermissionCode.FreezesView)
  @ApiOperation({ summary: 'Заморозки спортсмена' })
  @ApiOkResponse({ description: 'История заморозок, новые сверху' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('athleteId') athleteId: string,
  ): Promise<FreezeView[]> {
    return this.freezes.list(user.id, athleteId);
  }

  @Post()
  @RequirePermissions(PermissionCode.FreezesEdit)
  @ApiOperation({ summary: 'Открыть заморозку' })
  @ApiOkResponse({ description: 'Заморозка открыта' })
  open(
    @CurrentUser() user: AuthenticatedUser,
    @Param('athleteId') athleteId: string,
    @Body() dto: CreateFreezeDto,
  ): Promise<FreezeView> {
    return this.freezes.open(user.id, athleteId, {
      startedOn: dto.startedOn,
      reason: dto.reason ?? null,
    });
  }
}

/**
 * Завершение заморозки по ее идентификатору.
 *
 * Отдельный маршрут: открытая заморозка у спортсмена одна, но закрыть нужно
 * конкретную — например, если период вносили задним числом и он уже в прошлом.
 */
@ApiTags('freezes')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('freezes')
export class FreezeCloseController {
  constructor(private readonly freezes: FreezesService) {}

  @Post(':freezeId/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.FreezesEdit)
  @ApiOperation({ summary: 'Завершить заморозку' })
  @ApiOkResponse({ description: 'Заморозка закрыта' })
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('freezeId') freezeId: string,
    @Body() dto: CloseFreezeDto,
  ): Promise<FreezeView> {
    return this.freezes.close(user.id, freezeId, { endedOn: dto.endedOn });
  }
}
