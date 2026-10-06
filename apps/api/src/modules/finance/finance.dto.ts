import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@octagon/contracts';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Год и месяц расчетного периода (BR-001: учет по календарным месяцам). */
export class PeriodQueryDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @ApiProperty({ example: 10, minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}

export class YearQueryDto {
  @ApiPropertyOptional({ example: 2026, description: 'По умолчанию текущий год' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;
}

/**
 * Изменение расчетного периода.
 *
 * Ожидаемая сумма вводится вручную (BR-002): у нового спортсмена она может быть
 * любой, в том числе не заданной.
 */
export class UpdateMembershipPeriodDto {
  @ApiPropertyOptional({ example: 25000, nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedAmount?: number | null;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

/**
 * Ручная отметка «оплачен полностью» (BR-003).
 *
 * Валидатор обязателен: ValidationPipe настроен с `whitelist`, поэтому поле без
 * декоратора вырезается из тела, и запрос отклоняется как содержащий лишние
 * свойства.
 */
export class MarkFullyPaidDto {
  @ApiProperty({ description: 'true — отметить месяц оплаченным, false — снять отметку' })
  @IsBoolean()
  marked!: boolean;
}

/** Внесение оплаты произвольной суммы (BR-002). */
export class RecordPaymentDto {
  @ApiProperty({ example: 25000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ enum: Object.values(PaymentMethod), default: 'CASH' })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Календарная дата оплаты, YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  paidAt?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @ApiPropertyOptional({
    description: 'Ключ идемпотентности: повторная отправка не создаст вторую оплату',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}

export class UpdatePaymentDto {
  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({ enum: Object.values(PaymentMethod) })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Календарная дата оплаты, YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  paidAt?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

/**
 * Возврат денег по расчетному периоду (ADR-0010).
 *
 * `paymentId` необязателен: возврат можно привязать к конкретному поступлению, а
 * можно оформить как корректировку периода. Сумма всегда положительна —
 * направление задает сам факт возврата, а не знак числа.
 */
export class RefundPaymentDto {
  @ApiProperty({ example: 10000, description: 'Сумма возврата, больше нуля' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ description: 'Календарная дата возврата, YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  refundedAt?: string;

  @ApiPropertyOptional({ maxLength: 500, example: 'Спортсмен ушел из клуба' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Поступление, к которому относится возврат; по нему проверяется лимит',
  })
  @IsOptional()
  @IsUUID()
  paymentId?: string;

  @ApiPropertyOptional({ enum: Object.values(PaymentMethod), default: 'CASH' })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Ключ идемпотентности: повторная отправка не создаст второй возврат',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}

/** Идентификатор спортсмена в пути. */
export class AthleteIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  athleteId!: string;
}
