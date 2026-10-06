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
import { PermissionCode, type DebtorSummary, type MembershipPeriodView } from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import {
  MarkFullyPaidDto,
  PeriodQueryDto,
  RecordPaymentDto,
  RefundPaymentDto,
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
 * Маршруты разделены по ресурсам: период открывается по паре год/месяц, а
 * изменения адресуются идентификатором периода. Иначе `PATCH
 * /athletes/{id}/membership-periods/{periodId}` перехватывался бы маршрутом
 * `GET .../{year}/{month}`, и валидация года давала бы 400 на верном запросе.
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
    return this.finance.listPeriods(user.id, athleteId, query.year ?? new Date().getFullYear());
  }

  @Get(':year/:month')
  @RequirePermissions(PermissionCode.PaymentsView)
  @ApiOperation({ summary: 'Расчетный период за месяц' })
  @ApiOkResponse({ description: 'Период создается при первом обращении' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('athleteId') athleteId: string,
    @Param('year') year: string,
    @Param('month') month: string,
  ): Promise<MembershipPeriodView> {
    return this.finance.getPeriod(user.id, athleteId, Number(year), Number(month));
  }
}

/** Изменения расчетного периода: адресуются идентификатором периода. */
@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('membership-periods')
export class MembershipPeriodActionsController {
  constructor(private readonly finance: FinanceService) {}

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

  @Post(':periodId/refunds')
  @RequirePermissions(PermissionCode.PaymentsEdit)
  @ApiOperation({ summary: 'Оформить возврат денег' })
  @ApiOkResponse({ description: 'Период после пересчета: зачтено = поступления − возвраты' })
  refundPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('periodId') periodId: string,
    @Body() dto: RefundPaymentDto,
  ): Promise<MembershipPeriodView> {
    return this.finance.refundPayment(user.id, periodId, {
      amount: dto.amount,
      refundedAt: dto.refundedAt,
      reason: dto.reason ?? null,
      paymentId: dto.paymentId ?? null,
      method: dto.method,
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

/**
 * Возвраты: отмена ошибочно оформленного возврата (ADR-0010).
 *
 * Отдельный маршрут: возврат — не оплата, и «отменить оплату» на него не
 * действует. Оформление возврата адресуется периодом, отмена — идентификатором
 * самой записи.
 */
@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('refunds')
export class RefundsController {
  constructor(private readonly finance: FinanceService) {}

  @Delete(':refundId')
  @RequirePermissions(PermissionCode.PaymentsEdit)
  @ApiOperation({ summary: 'Отменить возврат' })
  @ApiOkResponse({ description: 'Возврат удален, период пересчитан' })
  void(@CurrentUser() user: AuthenticatedUser, @Param('refundId') refundId: string) {
    return this.finance.voidRefund(user.id, refundId);
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
