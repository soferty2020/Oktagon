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
  type HallDetails,
  type HallView,
  type TrainerView,
} from '@octagon/contracts';

import { AuthGuard } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import {
  CreateHallDto,
  CreateTrainerDto,
  LinkTrainerAccountDto,
  ListHallsQueryDto,
  ListTrainersQueryDto,
  UpdateHallDto,
  UpdateTrainerDto,
} from './club-structure.dto';
import { ClubStructureService } from './club-structure.service';

/**
 * Залы (C2, #64).
 *
 * Филиалов нет: зал — площадка клуба, у него есть адрес и телефон. Внутри зала
 * живут группы. Изменения требуют права `branches.manage` (имя историческое) и
 * попадают в audit log (BR-007).
 *
 * Удаление — мягкое: DELETE архивирует запись (docs/08-database.md).
 */
@ApiTags('halls')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('halls')
export class HallsController {
  constructor(private readonly club: ClubStructureService) {}

  @Get()
  @RequirePermissions(PermissionCode.BranchesView)
  @ApiOperation({ summary: 'Список залов' })
  @ApiOkResponse({ description: 'Залы клуба' })
  list(@Query() query: ListHallsQueryDto): Promise<HallView[]> {
    return this.club.listHalls({ isActive: query.isActive });
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.BranchesView)
  @ApiOperation({ summary: 'Зал с группами' })
  @ApiOkResponse({ description: 'Зал и его группы' })
  get(@Param('id') id: string): Promise<HallDetails> {
    return this.club.getHall(id);
  }

  @Post()
  @RequirePermissions(PermissionCode.BranchesManage)
  @ApiOperation({ summary: 'Создать зал' })
  @ApiCreatedResponse({ description: 'Зал создан' })
  create(@Body() dto: CreateHallDto): Promise<HallView> {
    return this.club.createHall({
      name: dto.name,
      address: dto.address ?? null,
      phone: dto.phone ?? null,
      capacity: dto.capacity ?? null,
    });
  }

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
 * Тренеры (C3, #69).
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
      firstName: dto.firstName,
      lastName: dto.lastName,
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

  @Delete(':id/account')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.UsersManage)
  @ApiOperation({ summary: 'Снять связь профиля с аккаунтом' })
  @ApiOkResponse({ description: 'Связь снята; профиль остается в истории' })
  unlinkAccount(@Param('id') id: string): Promise<TrainerView> {
    return this.club.unlinkTrainerAccount(id);
  }
}
