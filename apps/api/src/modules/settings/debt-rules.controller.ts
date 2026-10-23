import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DebtRulesVersionView } from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { SuperadminGuard } from '../../shared/superadmin.guard';
import { CreateDebtRulesDto, DebtRulesQueryDto, toTolerance } from './debt-rules.dto';
import { DebtRulesService, startOfCurrentMonth } from './debt-rules.service';

/**
 * Правила расчета задолженности (K5, docs/26-admin-settings.md, ADR-0014).
 *
 * Только суперадминистратор: финансовое правило не делегируется через
 * индивидуальные grants. Чтение тоже закрыто — правило влияет на деньги, и
 * «просто посмотреть» здесь не отдельная операция.
 */
@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AuthGuard, SuperadminGuard)
@Controller('settings/finance/debt-rules')
export class DebtRulesController {
  constructor(private readonly debtRules: DebtRulesService) {}

  @Get()
  @ApiOperation({ summary: 'Действующие правила за месяц' })
  @ApiOkResponse({ description: 'Версия правил, действовавшая в указанном месяце' })
  get(@Query() query: DebtRulesQueryDto): Promise<DebtRulesVersionView> {
    const month = query.month ?? currentMonth();
    return this.debtRules.getForMonth(month);
  }

  @Get('versions')
  @ApiOperation({ summary: 'История версий правил' })
  @ApiOkResponse({ description: 'Версии от новых к старым' })
  listVersions(): Promise<DebtRulesVersionView[]> {
    return this.debtRules.listVersions();
  }

  @Post()
  @ApiOperation({ summary: 'Новая версия правил' })
  @ApiCreatedResponse({ description: 'Созданная версия; изменение записано в аудит' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDebtRulesDto,
  ): Promise<DebtRulesVersionView> {
    return this.debtRules.create(user.id, {
      effectiveFrom: dto.effectiveFrom,
      useFullyPaidMark: dto.useFullyPaidMark,
      noTrainingPolicy: dto.noTrainingPolicy,
      freezePolicy: dto.freezePolicy,
      expectedMissing: dto.expectedMissing,
      partialTolerance: toTolerance(dto.partialTolerance),
      note: dto.note,
    });
  }
}

/** Текущий месяц в формате `YYYY-MM`. */
function currentMonth(): string {
  const monthStart = startOfCurrentMonth();
  return monthStart.toISOString().slice(0, 7);
}
