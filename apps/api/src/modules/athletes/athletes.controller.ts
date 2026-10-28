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
  type AthleteDetails,
  type AthleteView,
} from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import { AthletesService } from './athletes.service';
import {
  CreateAthleteDto,
  LinkAccountDto,
  ListAthletesQueryDto,
  UpdateAthleteDto,
} from './athletes.dto';

/**
 * Спортсмены и связи с аккаунтами (issues C4–C5).
 *
 * Спецификация: docs/07-domain-model.md, docs/22-erd.md,
 * docs/04-roles-permissions.md (`athletes.*`), BR-007, BR-008.
 *
 * Права `athletes.view` / `athletes.edit` дополняются проверкой scope: наличие
 * права не дает доступа к спортсмену вне своей группы
 * (docs/21-permission-matrix.md).
 */
@ApiTags('athletes')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('athletes')
export class AthletesController {
  constructor(private readonly athletes: AthletesService) {}

  @Get()
  @RequirePermissions(PermissionCode.AthletesView)
  @ApiOperation({ summary: 'Спортсмены в зоне видимости вызывающего' })
  @ApiOkResponse({ description: 'Список спортсменов; контакты — только с правом' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAthletesQueryDto,
  ): Promise<AthleteView[]> {
    return this.athletes.list(user.id, { status: query.status, search: query.search });
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.AthletesView)
  @ApiOperation({ summary: 'Карточка спортсмена' })
  @ApiOkResponse({ description: 'Карточка с заметками и связанными аккаунтами' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<AthleteDetails> {
    return this.athletes.get(user.id, id);
  }

  @Post()
  @RequirePermissions(PermissionCode.AthletesEdit)
  @ApiOperation({ summary: 'Создать карточку спортсмена' })
  @ApiCreatedResponse({ description: 'Карточка создана' })
  create(@Body() dto: CreateAthleteDto): Promise<AthleteView> {
    // Даты остаются строками контракта: в Date их переводит сервис.
    return this.athletes.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      middleName: dto.middleName ?? null,
      birthDate: dto.birthDate ?? null,
      gender: dto.gender,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      notes: dto.notes ?? null,
    });
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.AthletesEdit)
  @ApiOperation({ summary: 'Изменить карточку спортсмена' })
  @ApiOkResponse({ description: 'Карточка обновлена' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAthleteDto,
  ): Promise<AthleteDetails> {
    return this.athletes.update(user.id, id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      middleName: dto.middleName ?? null,
      birthDate: dto.birthDate ?? null,
      gender: dto.gender,
      // Ступень передаётся дальше: она источник истины для пояса (ADR-0012).
      // Без неё PATCH со сменой ступени молча менял бы только пояс.
      rank: dto.rank,
      // Пояс передается как есть: PATCH только со статусом не должен менять пояс,
      // а очистить его нельзя — белый остается значением по умолчанию.
      beltGrade: dto.beltGrade,
      beltAwardedAt: dto.beltAwardedAt,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      notes: dto.notes ?? null,
      status: dto.status,
      // Зал не подставляем через `?? null`: отсутствие поля означает «не
      // трогать», а null — «снять привязку» (#68).
      hallId: dto.hallId,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PermissionCode.AthletesEdit)
  @ApiOperation({ summary: 'Архивировать спортсмена (мягкое удаление)' })
  @ApiNoContentResponse({ description: 'Карточка архивирована' })
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.athletes.archive(user.id, id);
  }

  /**
   * Стирание ПДн (#56, SEC-15).
   *
   * Отдельный маршрут, а не флаг архивации: это необратимая операция с данными
   * ребёнка, и она должна быть явной в API и в аудите.
   */
  @Post(':id/erase')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PermissionCode.AthletesEdit)
  @ApiOperation({ summary: 'Стереть персональные данные спортсмена' })
  @ApiNoContentResponse({ description: 'ПДн обезличены, история сохранена' })
  erase(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.athletes.erase(user.id, id);
  }

  @Post(':id/accounts')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.AthletesEdit)
  @ApiOperation({ summary: 'Связать аккаунт со спортсменом' })
  @ApiOkResponse({ description: 'Связь создана; карточка с обновленными связями' })
  linkAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: LinkAccountDto,
  ): Promise<AthleteDetails> {
    return this.athletes.linkAccount(user.id, id, {
      userId: dto.userId,
      relation: dto.relation,
      isPrimary: dto.isPrimary,
    });
  }

  @Delete(':id/accounts/:userId')
  @RequirePermissions(PermissionCode.AthletesEdit)
  @ApiOperation({ summary: 'Снять связь аккаунта со спортсменом' })
  @ApiOkResponse({ description: 'Связь удалена; карточка с обновленными связями' })
  unlinkAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<AthleteDetails> {
    return this.athletes.unlinkAccount(user.id, id, userId);
  }
}
