import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionCode, type CertificationView } from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import { CreateCertificationDto } from './certifications.dto';
import { CertificationsService } from './certifications.service';

/**
 * Аттестации спортсмена.
 *
 * Чтение и запись под правом `athletes.*`: аттестация — часть карточки
 * спортсмена, отдельного права в матрице нет. Отмена разрешена: ошибочная
 * запись должна исправляться, но каждая операция попадает в аудит.
 */
@ApiTags('athletes')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('athletes/:athleteId/certifications')
export class CertificationsController {
  constructor(private readonly certifications: CertificationsService) {}

  @Get()
  @RequirePermissions(PermissionCode.AthletesView)
  @ApiOperation({ summary: 'История аттестаций спортсмена' })
  @ApiOkResponse({ description: 'Аттестации от новых к старым' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('athleteId') athleteId: string,
  ): Promise<CertificationView[]> {
    return this.certifications.list(user.id, athleteId);
  }

  @Post()
  @RequirePermissions(PermissionCode.AthletesEdit)
  @ApiOperation({ summary: 'Новая аттестация: присвоить ступень и пояс' })
  @ApiCreatedResponse({ description: 'Созданная аттестация; текущий пояс обновлен' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('athleteId') athleteId: string,
    @Body() dto: CreateCertificationDto,
  ): Promise<CertificationView> {
    return this.certifications.create(user.id, athleteId, {
      certifiedOn: dto.certifiedOn,
      // Ступень передаётся дальше: без неё сервис получал только старые поля и
      // отвергал запрос «Укажите ступень», хотя клиент её прислал.
      rank: dto.rank,
      beltGrade: dto.beltGrade,
      stageKind: dto.stageKind,
      stageNumber: dto.stageNumber,
      note: dto.note,
    });
  }
}

/**
 * Отмена аттестации.
 *
 * Отдельный контроллер без `athleteId` в пути: у записи он есть, и клиенту не
 * нужно помнить, к какому спортсмену она относится.
 */
@ApiTags('athletes')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('certifications')
export class CertificationCancelController {
  constructor(private readonly certifications: CertificationsService) {}

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PermissionCode.AthletesEdit)
  @ApiOperation({ summary: 'Отменить ошибочную аттестацию' })
  @ApiNoContentResponse({ description: 'Запись удалена, текущий пояс пересчитан' })
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.certifications.cancel(user.id, id);
  }
}
