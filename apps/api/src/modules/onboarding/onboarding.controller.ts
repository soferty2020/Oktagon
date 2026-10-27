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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  PermissionCode,
  type AthleteLinkCodeIssued,
  type LinkRequestCandidate,
  type LinkRequestView,
} from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import {
  ApproveLinkRequestDto,
  CreateLinkRequestDto,
  LinkCodeDto,
  RejectLinkRequestDto,
} from './onboarding.dto';
import { OnboardingService } from './onboarding.service';

/**
 * Привязка родителя к ребёнку (ADR-0015).
 *
 * Родитель получает доступ двумя путями: вводит код от тренера или оставляет
 * заявку, которую подтверждает администратор. До привязки данных ребёнка он не
 * видит.
 */
@ApiTags('onboarding')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, PermissionsGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  /** Родитель вводит код, который дал тренер или администратор. */
  @Post('me/link-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Привязать ребёнка по коду' })
  @ApiOkResponse({ description: 'Связь создана' })
  acceptCode(
    @CurrentUser() caller: AuthenticatedUser,
    @Body() dto: LinkCodeDto,
  ): Promise<{ athleteId: string }> {
    return this.onboarding.acceptCode(caller.id, dto.code);
  }

  /** Родитель оставляет заявку, если кода нет. */
  @Post('me/link-requests')
  @ApiOperation({ summary: 'Оставить заявку на привязку' })
  @ApiCreatedResponse({ description: 'Заявка создана и ждёт решения администратора' })
  createRequest(
    @CurrentUser() caller: AuthenticatedUser,
    @Body() dto: CreateLinkRequestDto,
  ): Promise<LinkRequestView> {
    return this.onboarding.createRequest(caller.id, dto);
  }

  /** Свои заявки: статус и причина отказа. */
  @Get('me/link-requests')
  @ApiOperation({ summary: 'Мои заявки на привязку' })
  @ApiOkResponse({ description: 'Список заявок со статусами' })
  listMyRequests(@CurrentUser() caller: AuthenticatedUser): Promise<LinkRequestView[]> {
    return this.onboarding.listMyRequests(caller.id);
  }

  /** Тренер или администратор выдаёт код привязки к спортсмену. */
  @Post('athletes/:athleteId/link-code')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PermissionCode.AthletesEdit)
  @ApiOperation({ summary: 'Выдать код привязки родителя' })
  @ApiCreatedResponse({ description: 'Код показывается один раз; в базе хранится хеш' })
  issueCode(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('athleteId') athleteId: string,
  ): Promise<AthleteLinkCodeIssued> {
    return this.onboarding.issueCode(caller.id, athleteId);
  }

  /** Очередь заявок для администратора. */
  @Get('link-requests')
  @RequirePermissions(PermissionCode.UsersManage)
  @ApiOperation({ summary: 'Заявки на привязку, ожидающие решения' })
  @ApiOkResponse({ description: 'Список заявок' })
  listPending(): Promise<LinkRequestView[]> {
    return this.onboarding.listPending();
  }

  /** Кандидаты: карточки, похожие на описание в заявке. */
  @Get('link-requests/:requestId/candidates')
  @RequirePermissions(PermissionCode.UsersManage)
  @ApiOperation({ summary: 'Кандидаты на сопоставление с заявкой' })
  @ApiOkResponse({ description: 'До десяти карточек, похожих по фамилии' })
  candidates(@Param('requestId') requestId: string): Promise<LinkRequestCandidate[]> {
    return this.onboarding.candidates(requestId);
  }

  /** Подтверждение: создаёт связь родителя с выбранной карточкой. */
  @Post('link-requests/:requestId/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.UsersManage)
  @ApiOperation({ summary: 'Подтвердить заявку' })
  @ApiOkResponse({ description: 'Связь создана, заявка закрыта' })
  approve(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: ApproveLinkRequestDto,
  ): Promise<LinkRequestView> {
    return this.onboarding.approve(caller.id, requestId, dto.athleteId);
  }

  /** Отклонение с причиной: родитель увидит её в приложении. */
  @Post('link-requests/:requestId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.UsersManage)
  @ApiOperation({ summary: 'Отклонить заявку' })
  @ApiOkResponse({ description: 'Заявка закрыта с причиной' })
  reject(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: RejectLinkRequestDto,
  ): Promise<LinkRequestView> {
    return this.onboarding.reject(caller.id, requestId, dto.reason);
  }
}
