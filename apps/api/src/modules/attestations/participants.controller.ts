import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionCode, type CertificationParticipantView } from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import {
  AddParticipantDto,
  SetParticipantPaymentDto,
  UpdateParticipantDto,
} from './participants.dto';
import { ParticipantsService } from './participants.service';

/**
 * Участники мероприятия (#34).
 *
 * Оплата — отдельный эндпоинт: у неё другое право (только руководитель), и
 * смешивать её с допуском значило бы разрешить тренеру менять оплату через
 * общий `PATCH`.
 */
@ApiTags('certification-participants')
@ApiBearerAuth()
@Controller('certification-events/:eventId/participants')
@UseGuards(AuthGuard, PermissionsGuard)
export class ParticipantsController {
  constructor(private readonly participants: ParticipantsService) {}

  @Get()
  @RequirePermissions(PermissionCode.AttestationsView)
  @ApiOperation({ summary: 'Участники мероприятия' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<CertificationParticipantView[]> {
    return this.participants.list(eventId, { userId: user.id, role: user.role ?? 'MEMBER' });
  }

  @Post()
  @RequirePermissions(PermissionCode.AttestationsResults)
  @ApiOperation({ summary: 'Добавить участника; тренер — только своих спортсменов' })
  @ApiCreatedResponse({ description: 'Участник добавлен' })
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: AddParticipantDto,
  ): Promise<CertificationParticipantView> {
    return this.participants.add(
      user.id,
      eventId,
      dto,
      // Ответственный по умолчанию — тот, кто добавляет: его и сохраняем в записи,
      // чтобы право на исправление осталось при переводе в другую группу.
      dto.responsibleTrainerId ?? null,
    );
  }

  @Patch(':athleteId')
  @RequirePermissions(PermissionCode.AttestationsResults)
  @ApiOperation({ summary: 'Допуск и целевая ступень' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('athleteId', ParseUUIDPipe) athleteId: string,
    @Body() dto: UpdateParticipantDto,
  ): Promise<CertificationParticipantView> {
    return this.participants.update(user.id, eventId, athleteId, dto);
  }

  @Patch(':athleteId/payment')
  @RequirePermissions(PermissionCode.AttestationsResults)
  @ApiOperation({ summary: 'Оплата экзамена; только руководитель' })
  async setPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('athleteId', ParseUUIDPipe) athleteId: string,
    @Body() dto: SetParticipantPaymentDto,
  ): Promise<CertificationParticipantView> {
    return this.participants.setPayment(
      user.id,
      user.role === 'SUPERADMIN',
      eventId,
      athleteId,
      dto.paymentStatus,
    );
  }

  @Delete(':athleteId')
  @RequirePermissions(PermissionCode.AttestationsResults)
  @ApiOperation({ summary: 'Удалить участника; тренер — только своего спортсмена' })
  @ApiNoContentResponse({ description: 'Участник удалён' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('athleteId', ParseUUIDPipe) athleteId: string,
  ): Promise<void> {
    await this.participants.remove(user.id, eventId, athleteId);
  }
}
