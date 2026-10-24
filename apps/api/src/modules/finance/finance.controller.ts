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
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  PermissionCode,
  type DebtorSummary,
  type DebtRulesPreview,
  type FinanceDynamics,
  type FinanceSummary,
  type MembershipPeriodView,
} from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import { SuperadminGuard } from '../../shared/superadmin.guard';
import { DebtRulesQueryDto, PreviewDebtRulesDto, toTolerance } from '../settings/debt-rules.dto';
import {
  DynamicsQueryDto,
  ExportPeriodQueryDto,
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

  @Get('export')
  @RequirePermissions(PermissionCode.PaymentsView)
  @ApiOperation({ summary: 'Выгрузка списка должников за месяц в CSV' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV с BOM и разделителем ; для Excel' })
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PeriodQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.finance.exportDebtorsCsv(user.id, query.year, query.month);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return file.content;
  }
}

/**
 * Предпросмотр новых правил долга (K5, ADR-0014).
 *
 * Живет в финансах, а не в настройках: чтобы посчитать «до» и «после», нужен
 * доступ к периодам, заморозкам и занятиям — то есть к данным финансов. Сами
 * версии правил настраиваются в `/settings/finance/debt-rules`.
 *
 * Доступ только суперадминистратору: preview показывает суммы по спортсменам.
 */
@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(AuthGuard, SuperadminGuard)
@Controller('finance/debt-rules')
export class DebtRulesPreviewController {
  constructor(private readonly finance: FinanceService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Сравнить действующее правило с предлагаемым' })
  @ApiOkResponse({ description: 'Сколько должников станет и перестанет ими быть' })
  preview(
    @Body() dto: PreviewDebtRulesDto,
    @Query() query: DebtRulesQueryDto,
  ): Promise<DebtRulesPreview> {
    const month = query.month ?? new Date().toISOString().slice(0, 7);

    return this.finance.previewDebtRules(month, {
      useFullyPaidMark: dto.config.useFullyPaidMark,
      noTrainingPolicy: dto.config.noTrainingPolicy,
      freezePolicy: dto.config.freezePolicy,
      expectedMissing: dto.config.expectedMissing,
      partialTolerance: toTolerance(dto.config.partialTolerance),
    });
  }
}

/**
 * Сводка финансов за месяц (F8).
 *
 * Право то же, что и у остальных финансовых данных: `payments.view` (BR-010).
 * Отдельного `analytics.view` здесь недостаточно: в сводке суммы выручки и
 * задолженности, а не обезличенные счетчики.
 */
@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('finance')
export class FinanceSummaryController {
  constructor(private readonly finance: FinanceService) {}

  @Get('summary')
  @RequirePermissions(PermissionCode.PaymentsView)
  @ApiOperation({ summary: 'Сводка финансов за месяц с разбивкой по филиалам' })
  @ApiOkResponse({
    description: 'Выручка по датам движений, задолженность по расчетному месяцу',
  })
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PeriodQueryDto,
  ): Promise<FinanceSummary> {
    return this.finance.summary(user.id, query.year, query.month);
  }

  @Get('dynamics')
  @RequirePermissions(PermissionCode.PaymentsView)
  @ApiOperation({ summary: 'Динамика выручки и задолженности за несколько месяцев' })
  @ApiOkResponse({ description: 'Точки от старых к новым; выручка по движениям, долг по месяцам' })
  dynamics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DynamicsQueryDto,
  ): Promise<FinanceDynamics> {
    return this.finance.dynamics(user.id, query.year, query.month, query.months ?? 6);
  }

  @Get('payments/export')
  @RequirePermissions(PermissionCode.PaymentsView)
  @ApiOperation({ summary: 'Выгрузка движений средств в CSV' })
  @ApiOkResponse({ description: 'CSV с BOM и разделителем ; для Excel' })
  async exportPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExportPeriodQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.finance.exportPaymentsCsv(user.id, query.from, query.to);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return file.content;
  }
}
