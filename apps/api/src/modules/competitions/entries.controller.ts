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
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionCode } from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import { CompetitionEntriesService } from './competition-entries.service';
import {
  AddCompetitionParticipantDto,
  AddEntryDto,
  AddMatchDto,
  CreateCategoryDto,
  RecordEntryResultDto,
  SetCompetitionPaymentDto,
  UpdateCategoryDto,
} from './entries.dto';

/**
 * Категории турнира (#37).
 *
 * Справочник меняет только руководитель: категории — общая настройка клуба, и
 * правка «на ходу» под один турнир испортила бы историю остальных.
 */
@ApiTags('competition-categories')
@ApiBearerAuth()
@Controller('competitions/categories')
@UseGuards(AuthGuard, PermissionsGuard)
export class CompetitionCategoriesController {
  constructor(private readonly entries: CompetitionEntriesService) {}

  @Get()
  @RequirePermissions(PermissionCode.CompetitionsView)
  @ApiOperation({ summary: 'Категории: общие и турнирные' })
  async list(@Query('competitionId') competitionId?: string) {
    return this.entries.listCategories(competitionId);
  }

  @Post()
  @RequirePermissions(PermissionCode.CompetitionsManage)
  @ApiOperation({ summary: 'Создать категорию; только руководитель' })
  @ApiCreatedResponse({ description: 'Категория создана' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    return this.entries.createCategory(user.role === 'SUPERADMIN', {
      discipline: dto.discipline,
      name: dto.name,
      ageFrom: dto.ageFrom ?? null,
      ageTo: dto.ageTo ?? null,
      weightFrom: dto.weightFrom ?? null,
      weightTo: dto.weightTo ?? null,
      beltFrom: dto.beltFrom ?? null,
      beltTo: dto.beltTo ?? null,
      competitionId: dto.competitionId ?? null,
    });
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.CompetitionsManage)
  @ApiOperation({ summary: 'Изменить категорию; только руководитель' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    // DTO — класс, а не словарь: передаём поля явно, чтобы правка не протащила
    // в update лишние ключи из тела запроса.
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.ageFrom !== undefined) patch.ageFrom = dto.ageFrom;
    if (dto.ageTo !== undefined) patch.ageTo = dto.ageTo;
    if (dto.weightFrom !== undefined) patch.weightFrom = dto.weightFrom;
    if (dto.weightTo !== undefined) patch.weightTo = dto.weightTo;
    if (dto.beltFrom !== undefined) patch.beltFrom = dto.beltFrom;
    if (dto.beltTo !== undefined) patch.beltTo = dto.beltTo;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;

    return this.entries.updateCategory(user.id, user.role === 'SUPERADMIN', id, patch);
  }
}

/** Участники турнира и их участия (#37). */
@ApiTags('competition-participants')
@ApiBearerAuth()
@Controller('competitions/:competitionId/participants')
@UseGuards(AuthGuard, PermissionsGuard)
export class CompetitionParticipantsController {
  constructor(private readonly entries: CompetitionEntriesService) {}

  @Get()
  @RequirePermissions(PermissionCode.CompetitionsView)
  @ApiOperation({ summary: 'Заявленные спортсмены с участиями' })
  async list(@Param('competitionId', ParseUUIDPipe) competitionId: string) {
    return this.entries.listParticipants(competitionId);
  }

  @Post()
  @RequirePermissions(PermissionCode.CompetitionsResults)
  @ApiOperation({ summary: 'Заявить спортсмена; тренер — только своих' })
  @ApiCreatedResponse({ description: 'Спортсмен заявлен' })
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
    @Body() dto: AddCompetitionParticipantDto,
  ) {
    return this.entries.addParticipant(
      user.id,
      competitionId,
      dto.athleteId,
      dto.responsibleTrainerId ?? null,
    );
  }

  @Patch(':athleteId/payment')
  @RequirePermissions(PermissionCode.CompetitionsResults)
  @ApiOperation({ summary: 'Оплата турнира; тренер — своих спортсменов' })
  async setPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
    @Param('athleteId', ParseUUIDPipe) athleteId: string,
    @Body() dto: SetCompetitionPaymentDto,
  ) {
    return this.entries.setPayment(user.id, competitionId, athleteId, dto.paymentStatus);
  }

  @Post(':athleteId/entries')
  @RequirePermissions(PermissionCode.CompetitionsResults)
  @ApiOperation({ summary: 'Добавить участие в дисциплине и категории' })
  @ApiCreatedResponse({ description: 'Участие добавлено' })
  async addEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
    @Param('athleteId', ParseUUIDPipe) athleteId: string,
    @Body() dto: AddEntryDto,
  ) {
    return this.entries.addEntry(
      user.id,
      competitionId,
      athleteId,
      dto.discipline,
      dto.categoryId,
    );
  }
}

/** Результаты и встречи (#38). */
@ApiTags('competition-results')
@ApiBearerAuth()
@Controller('competitions/:competitionId/participants/:athleteId/entries/:entryId')
@UseGuards(AuthGuard, PermissionsGuard)
export class CompetitionResultsController {
  constructor(private readonly entries: CompetitionEntriesService) {}

  @Post('result')
  @RequirePermissions(PermissionCode.CompetitionsResults)
  @ApiOperation({ summary: 'Записать итог; PLACED требует место, исправление — причину' })
  async record(
    @CurrentUser() user: AuthenticatedUser,
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
    @Param('athleteId', ParseUUIDPipe) athleteId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: RecordEntryResultDto,
  ) {
    return this.entries.recordResult(user.id, competitionId, athleteId, entryId, dto);
  }

  @Get('matches')
  @RequirePermissions(PermissionCode.CompetitionsView)
  @ApiOperation({ summary: 'Встречи кумитэ' })
  async matches(@Param('entryId', ParseUUIDPipe) entryId: string) {
    return this.entries.listMatches(entryId);
  }

  @Post('matches')
  @RequirePermissions(PermissionCode.CompetitionsResults)
  @ApiOperation({ summary: 'Добавить встречу; только для кумитэ' })
  @ApiCreatedResponse({ description: 'Встреча добавлена' })
  async addMatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
    @Param('athleteId', ParseUUIDPipe) athleteId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: AddMatchDto,
  ) {
    return this.entries.addMatch(user.id, competitionId, athleteId, entryId, dto);
  }
}
