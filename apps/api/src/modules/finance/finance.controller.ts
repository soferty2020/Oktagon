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
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PermissionCode,
  type DebtorSummary,
  type MembershipPeriodView,
} from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import {
  MarkFullyPaidDto,
  PeriodQueryDto,
  RecordPaymentDto,
  UpdateMembershipPeriodDto,
  UpdatePaymentDto,
  YearQueryDto,
} from './finance.dto';
import { FinanceService } from './finance.service';

/**
 * Финансы: расчетные периоды и оплаты (эпик F).
 *
 * Спецификация: BR-001 (учет по календарным месяцам), BR-002 (произвольная
 * сумма), BR-003 (ручная отметка «оплачен полностью»), BR-010 (доступ только с
 * явным финансовым правом).
 *
 * BR-010: просмотр требует `payments.view`, изменения — `payments.edit`. Ни одна
 * роль, кроме суперадмина, этих прав не имеет: тренер не видит финансы.
 */
@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('athletes/:athleteId/membership-periods')
export class MembershipPeriodsController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  @RequirePermissions(PermissionCode.PaymentsView)
  @ApiOperation({ summary: 'Расчетные периоды спортсмена за год' })
  @ApiOkResponse({ description: 'Периоды с оплатами' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('athleteId') athleteId: string,
    @Query() query: YearQueryDto,
  ): Promise<MembershipPeriodView[]> {
    const year = query.year ?? new Date().getFullYear();
    return this.finance.listPeriods(user.id, athleteId, year);
  }

  @Get(':year/:month')
  @RequirePermissions(PermissionCode.PaymentsView)
  @ApiOperation({ summary: 'Расчетный период за месяц' })
  @ApiOkResponse({ description: 'Период создается при первом обращении' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('athleteId') athleteId: string,
    @Param() params: PeriodQueryDto,
  ): Promise<MembershipPeriodView> {
    return this.finance.getPeriod(user.id, athleteId, params.year, params.month);
  }

  @Patch(':periodId')
  @RequirePermissions(PermissionCode.PaymentsEdit)
  @ApiOperation({ summary: 'Изменить ожидаемую сумму и заметку периода' })
  @ApiOkResponse({ description: 'Период обновлен и пересчитан' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('periodId') periodId: string,
    @Body() dto: UpdateMembershipPeriodDto,
  ): Promise<MembershipPeriodView> {
    return this.finance.updatePeriod(user.id, periodId, {
      expectedAmount: dto.expectedAmount,
      note: dto.note,
    });
  }

  @Post(':periodId/fully-paid')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.PaymentsEdit)
  @ApiOperation({ summary: 'Отметить месяц оплаченным полностью (BR-003)' })
  @ApiOkResponse({ description: 'Отметка поставлена или снята' })
  markFullyPaid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('periodId') periodId: string,
    @Body() dto: MarkFullyPaidDto,
  ): Promise<MembershipPeriodView> {
    return this.finance.setFullyPaid(user.id, periodId, dto.marked);
  }

  @Post(':periodId/payments')
  @RequirePermissions(PermissionCode.PaymentsEdit)
  @ApiOperation({ summary: 'Внести оплату' })
  @ApiOkResponse({ description: 'Период после пересчета' })
  recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('periodId') periodId: string,
    @Body() dto: RecordPaymentDto,
  ): Promise<MembershipPeriodView> {
    return this.finance.recordPayment(user.id, periodId, {
      amount: dto.amount,
      method: dto.method,
      paidAt: dto.paidAt,
      comment: dto.comment ?? null,
      idempotencyKey: dto.idempotencyKey,
    });
  }
}

/** Оплаты: изменения и отмена. */
@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly finance: FinanceService) {}

  @Patch(':paymentId')
  @RequirePermissions(PermissionCode.PaymentsEdit)
  @ApiOperation({ summary: 'Изменить оплату' })
  @ApiOkResponse({ description: 'Период после пересчета' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId') paymentId: string,
    @Body() dto: UpdatePaymentDto,
  ): Promise<MembershipPeriodView> {
    return this.finance.updatePayment(user.id, paymentId, {
      amount: dto.amount,
      method: dto.method,
      paidAt: dto.paidAt,
      comment: dto.comment,
    });
  }

  @Delete(':paymentId')
  @RequirePermissions(PermissionCode.PaymentsEdit)
  @ApiOperation({ summary: 'Отменить оплату' })
  @ApiOkResponse({ description: 'Оплата удалена, период пересчитан' })
  void(@CurrentUser() user: AuthenticatedUser, @Param('paymentId') paymentId: string) {
    return this.finance.voidPayment(user.id, paymentId);
  }
}

/** Задолженность за месяц (BR-004). */
@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('debts')
export class DebtsController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  @RequirePermissions(PermissionCode.PaymentsView)
  @ApiOperation({ summary: 'Список должников за месяц' })
  @ApiOkResponse({
    description: 'Должники сверху; для остальных указана причина освобождения',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PeriodQueryDto,
  ): Promise<DebtorSummary[]> {
    return this.finance.listDebtors(user.id, query.year, query.month);
  }
}
