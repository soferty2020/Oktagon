import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DebtExpectedMissing,
  DebtFreezePolicy,
  DebtNoTrainingPolicy,
  type DebtTolerance,
} from '@octagon/contracts';

/**
 * Допуск недоплаты (K5, ADR-0014).
 *
 * Вид и значение разделены: сумма и процент взаимоисключающие, и заполнение
 * обоих сразу CHECK-ограничение в БД запрещает.
 */
export class DebtToleranceDto {
  @ApiProperty({ enum: ['NONE', 'FIXED', 'PERCENT'] })
  @IsIn(['NONE', 'FIXED', 'PERCENT'])
  kind!: 'NONE' | 'FIXED' | 'PERCENT';

  @ApiPropertyOptional({ example: 1000, description: 'Допуск суммой, ₽; только для FIXED' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ example: 2, description: 'Допуск процентом; только для PERCENT' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percent?: number;
}

/** Настройки без даты вступления: используются и для preview. */
export class DebtRulesConfigDto {
  @ApiProperty({ description: 'Учитывать ручную отметку «полностью оплачен» (BR-003)' })
  @IsBoolean()
  useFullyPaidMark!: boolean;

  @ApiProperty({ enum: Object.values(DebtNoTrainingPolicy) })
  @IsEnum(DebtNoTrainingPolicy)
  noTrainingPolicy!: DebtNoTrainingPolicy;

  @ApiProperty({ enum: Object.values(DebtFreezePolicy) })
  @IsEnum(DebtFreezePolicy)
  freezePolicy!: DebtFreezePolicy;

  @ApiProperty({ enum: Object.values(DebtExpectedMissing) })
  @IsEnum(DebtExpectedMissing)
  expectedMissing!: DebtExpectedMissing;

  @ApiProperty({ type: DebtToleranceDto })
  @ValidateNested()
  @Type(() => DebtToleranceDto)
  partialTolerance!: DebtToleranceDto;
}

/** Новая версия правил. */
export class CreateDebtRulesDto extends DebtRulesConfigDto {
  @ApiProperty({
    example: '2026-11',
    description: 'Месяц вступления в силу, YYYY-MM; прошлое запрещено',
  })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'effectiveFrom должен быть в формате YYYY-MM' })
  effectiveFrom!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Проверка правила до сохранения: сколько должников станет и перестанет ими быть. */
export class PreviewDebtRulesDto {
  @ApiProperty({ type: DebtRulesConfigDto })
  @ValidateNested()
  @Type(() => DebtRulesConfigDto)
  config!: DebtRulesConfigDto;
}

/** Фильтр действующей версии по месяцу. */
export class DebtRulesQueryDto {
  @ApiPropertyOptional({ example: '2026-10', description: 'Месяц, YYYY-MM; по умолчанию текущий' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month должен быть в формате YYYY-MM' })
  month?: string;
}

/**
 * DTO → доменный допуск.
 *
 * DTO допускает оба поля сразу (валидация не запрещает), поэтому вид решает,
 * какое значение важнее. CHECK-ограничение в БД дополнительно запрещает хранить
 * оба значения одновременно.
 */
export function toTolerance(dto: DebtToleranceDto): DebtTolerance {
  if (dto.kind === 'FIXED') {
    return { kind: 'FIXED', amount: dto.amount ?? 0 };
  }
  if (dto.kind === 'PERCENT') {
    return { kind: 'PERCENT', percent: dto.percent ?? 0 };
  }
  return { kind: 'NONE' };
}