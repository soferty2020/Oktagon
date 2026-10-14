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
  type BranchDetails,
  type BranchView,
  type HallView,
  type TrainerView,
} from '@octagon/contracts';

import { AuthGuard } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import {
  CreateBranchDto,
  CreateBranchHallDto,
  CreateTrainerDto,
  LinkTrainerAccountDto,
  ListBranchesQueryDto,
  ListTrainersQueryDto,
  UpdateBranchDto,
  UpdateHallDto,
  UpdateTrainerDto,
} from './club-structure.dto';
import { ClubStructureService } from './club-structure.service';

/**
 * Структура клуба (issues C1–C3).
 *
 * Спецификация: docs/00-project-overview.md, docs/22-erd.md,
 * docs/04-roles-permissions.md (`branches.view`, `branches.manage`).
 *
 * Изменения требуют права `branches.manage` и попадают в audit log (BR-007).
 * Удаление — мягкое: PATCH с `isActive: false` либо DELETE, который архивирует
 * запись (docs/08-database.md).
 */
@ApiTags('branches')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('branches')
export class BranchesController {
  constructor(private readonly club: ClubStructureService) {}

  @Get()
  @RequirePermissions(PermissionCode.BranchesView)
  @ApiOperation({ summary: 'Список филиалов' })
  @ApiOkResponse({ description: 'Филиалы клуба' })
  list(@Query() query: ListBranchesQueryDto): Promise<BranchView[]> {
    return this.club.listBranches({ isActive: query.isActive });
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.BranchesView)
  @ApiOperation({ summary: 'Филиал с залами' })
  @ApiOkResponse({ description: 'Филиал и его залы' })
  get(@Param('id') id: string): Promise<BranchDetails> {
    return this.club.getBranch(id);
  }

  @Post()
  @RequirePermissions(PermissionCode.BranchesManage)
  @ApiOperation({ summary: 'Создать филиал' })
  @ApiCreatedResponse({ description: 'Филиал создан' })
  create(@Body() dto: CreateBranchDto): Promise<BranchView> {
    return this.club.createBranch({
      name: dto.name,
      address: dto.address ?? null,
      phone: dto.phone ?? null,
    });
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.BranchesManage)
  @ApiOperation({ summary: 'Изменить филиал' })
  @ApiOkResponse({ description: 'Филиал обновлен' })
  update(@Param('id') id: string, @Body() dto: UpdateBranchDto): Promise<BranchView> {
    return this.club.updateBranch(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PermissionCode.BranchesManage)
  @ApiOperation({ summary: 'Архивировать филиал (мягкое удаление)' })
  @ApiNoContentResponse({ description: 'Филиал архивирован' })
  archive(@Param('id') id: string): Promise<void> {
    return this.club.archiveBranch(id);
  }

  @Get(':id/halls')
  @RequirePermissions(PermissionCode.BranchesView)
  @ApiOperation({ summary: 'Залы филиала' })
  @ApiOkResponse({ description: 'Список залов' })
  listHalls(@Param('id') branchId: string): Promise<HallView[]> {
    return this.club.listHalls(branchId);
  }

  @Post(':id/halls')
  @RequirePermissions(PermissionCode.BranchesManage)
  @ApiOperation({ summary: 'Создать зал в филиале' })
  @ApiCreatedResponse({ description: 'Зал создан' })
  createHall(@Param('id') branchId: string, @Body() dto: CreateBranchHallDto): Promise<HallView> {
    return this.club.createHall({
      branchId,
      name: dto.name,
      capacity: dto.capacity ?? null,
    });
  }
}

/**
 * Залы как самостоятельный ресурс: изменение и архивирование по идентификатору.
 *
 * Отдельный контроллер нужен, потому что зал адресуется и без филиала
 * (например, при переносе занятия).
 */
@ApiTags('halls')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('halls')
export class HallsController {
  constructor(private readonly club: ClubStructureService) {}

  @Patch(':id')
  @RequirePermissions(PermissionCode.BranchesManage)
  @ApiOperation({ summary: 'Изменить зал' })
  @ApiOkResponse({ description: 'Зал обновлен' })
  update(@Param('id') id: string, @Body() dto: UpdateHallDto): Promise<HallView> {
    return this.club.updateHall(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PermissionCode.BranchesManage)
  @ApiOperation({ summary: 'Архивировать зал (мягкое удаление)' })
  @ApiNoContentResponse({ description: 'Зал архивирован' })
  archive(@Param('id') id: string): Promise<void> {
    return this.club.archiveHall(id);
  }
}

/**
 * Тренеры (C3).
 *
 * В docs/04-roles-permissions.md нет отдельного права для профилей тренеров,
 * поэтому используется `branches.manage`: профиль тренера относится к
 * структуре клуба, а не к пользователям напрямую.
 */
@ApiTags('trainers')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('trainers')
export class TrainersController {
  constructor(private readonly club: ClubStructureService) {}

  @Get()
  @RequirePermissions(PermissionCode.GroupsView)
  @ApiOperation({ summary: 'Список тренеров' })
  @ApiOkResponse({ description: 'Тренеры клуба' })
  list(@Query() query: ListTrainersQueryDto): Promise<TrainerView[]> {
    return this.club.listTrainers({ isActive: query.isActive });
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.GroupsView)
  @ApiOperation({ summary: 'Профиль тренера' })
  @ApiOkResponse({ description: 'Профиль тренера' })
  get(@Param('id') id: string): Promise<TrainerView> {
    return this.club.getTrainer(id);
  }

  @Post()
  @RequirePermissions(PermissionCode.BranchesManage)
  @ApiOperation({ summary: 'Создать профиль тренера' })
  @ApiCreatedResponse({ description: 'Профиль создан' })
  create(@Body() dto: CreateTrainerDto): Promise<TrainerView> {
    return this.club.createTrainer({
      displayName: dto.displayName,
      phone: dto.phone ?? null,
      bio: dto.bio ?? null,
      userId: dto.userId ?? null,
    });
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.BranchesManage)
  @ApiOperation({ summary: 'Изменить профиль тренера' })
  @ApiOkResponse({ description: 'Профиль обновлен' })
  update(@Param('id') id: string, @Body() dto: UpdateTrainerDto): Promise<TrainerView> {
    return this.club.updateTrainer(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PermissionCode.BranchesManage)
  @ApiOperation({ summary: 'Архивировать профиль тренера' })
  @ApiNoContentResponse({ description: 'Профиль архивирован' })
  archive(@Param('id') id: string): Promise<void> {
    return this.club.archiveTrainer(id);
  }

  /**
   * Связывание профиля с аккаунтом.
   *
   * Право `users.manage`, а не `branches.manage`: связь дает человеку доступ к
   * системе — чаты групп, расписание, посещаемость. Это операция с учетной
   * записью, а не правка справочника, и она попадает в аудит (BR-007).
   *
   * `TRAINER_MANAGE_PERMISSIONS` в контракте перечисляет оба права для правки
   * профиля целиком; здесь важно именно то, которое отвечает за доступ.
   */
  @Post(':id/account')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.UsersManage)
  @ApiOperation({ summary: 'Связать профиль тренера с аккаунтом' })
  @ApiOkResponse({ description: 'Связь создана; профиль с аккаунтом' })
  linkAccount(@Param('id') id: string, @Body() dto: LinkTrainerAccountDto): Promise<TrainerView> {
    return this.club.linkTrainerAccount(id, dto.userId);
  }

  /**
   * Снятие связи с аккаунтом.
   *
   * Отдельный маршрут, а не `PATCH` с пустым `userId`: «отвязать» — это решение
   * отозвать доступ, и оно должно быть явным действием, а не отсутствием поля.
   */
  @Delete(':id/account')
  @RequirePermissions(PermissionCode.UsersManage)
  @ApiOperation({ summary: 'Снять связь профиля тренера с аккаунтом' })
  @ApiOkResponse({ description: 'Связь снята; профиль остается в расписании' })
  unlinkAccount(@Param('id') id: string): Promise<TrainerView> {
    return this.club.unlinkTrainerAccount(id);
  }
}
