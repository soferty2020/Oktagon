import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Фильтры журнала действий (K6).
 *
 * Все поля необязательны: без фильтров журнал показывает последние записи.
 * Период передается в ISO-8601, начало включительно, конец исключительно — так же,
 * как в остальных отчетах проекта.
 */
export class AuditQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Кто выполнил действие' })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @ApiPropertyOptional({ example: 'settings.club_updated', description: 'Действие' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({ example: 'ClubProfile', description: 'Тип сущности' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Идентификатор сущности' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Начало периода, ISO-8601; включительно' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Конец периода, ISO-8601; исключительно' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Курсор следующей страницы' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
