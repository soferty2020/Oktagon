import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionCode, TrialRequestStatus, type TrialRequestView } from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { clientIp } from '../../shared/client-ip';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import { CreateTrialRequestDto, UpdateTrialRequestDto } from './trial-requests.dto';
import { TrialRequestsService } from './trial-requests.service';

/**
 * Публичная форма заявки (ADR-0013).
 *
 * Отдельный контроллер без guard'ов: заявку оставляет человек, у которого ещё нет
 * аккаунта. Защита — honeypot и лимит по IP в сервисе.
 */
@ApiTags('trial-requests')
@Controller('trial-requests')
export class PublicTrialRequestsController {
  constructor(private readonly requests: TrialRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Оставить заявку на пробную тренировку (без авторизации)' })
  @ApiCreatedResponse({ description: 'Заявка принята' })
  async create(
    @Body() dto: CreateTrialRequestDto,
    @Req() request: Request,
  ): Promise<{ ok: true }> {
    // `dto` уже содержит consent: DTO пропускает только `true`.
    await this.requests.submit({ ...dto, consent: dto.consent === true }, clientIp(request));

    // Ответ одинаковый и при отсеянной заявке: бот не должен понять, что сработал
    // honeypot, иначе начнёт подбирать поля.
    return { ok: true };
  }
}

/** Список и обработка заявок — только администратор. */
@ApiTags('trial-requests-admin')
@ApiBearerAuth()
@Controller('trial-requests')
@UseGuards(AuthGuard, PermissionsGuard)
export class TrialRequestsController {
  constructor(private readonly requests: TrialRequestsService) {}

  @Get()
  @RequirePermissions(PermissionCode.TrialRequestsView)
  @ApiOperation({ summary: 'Заявки; фильтр по статусу' })
  @ApiOkResponse({ description: 'Заявки, новые сверху' })
  async list(@Query('status') status?: string): Promise<TrialRequestView[]> {
    const known = Object.values(TrialRequestStatus) as string[];
    const filter = status && known.includes(status) ? (status as TrialRequestStatus) : undefined;

    return this.requests.list(filter);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.TrialRequestsManage)
  @ApiOperation({ summary: 'Сменить статус заявки; финальные статусы необратимы' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTrialRequestDto,
  ): Promise<TrialRequestView> {
    return this.requests.updateStatus(user.id, id, dto.status);
  }
}
