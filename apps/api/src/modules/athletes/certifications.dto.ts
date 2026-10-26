import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CertificationStageKind, MAX_STAGE, MIN_STAGE } from '@octagon/contracts';

/**
 * Новая аттестация (K8).
 *
 * Пояс проверяется по справочнику в сервисе: в DTO его нельзя ограничить
 * `@IsEnum`, потому что справочник живет в контракте, а не в Prisma-enum.
 */
export class CreateCertificationDto {
  @ApiProperty({ example: '2024-02-10', description: 'Дата аттестации; будущее запрещено' })
  @IsDateString()
  certifiedOn!: string;

  /**
   * Ступень из каталога (ADR-0012): `kyu-0`…`kyu-10`, `dan-1`…`dan-10`.
   *
   * Предпочтительный способ. Если не задана, ступень выводится из
   * `stageKind`/`stageNumber` — для клиентов, не обновившихся вместе с API.
   */
  @ApiPropertyOptional({ example: 'kyu-8', description: 'Ступень из RankCatalog' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  rank?: string;

  @ApiPropertyOptional({ example: 'YELLOW', description: 'Пояс; проверяется на совпадение со ступенью' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  beltGrade?: string;

  @ApiPropertyOptional({ enum: Object.values(CertificationStageKind) })
  @IsOptional()
  @IsEnum(CertificationStageKind)
  stageKind?: CertificationStageKind;

  @ApiPropertyOptional({ minimum: MIN_STAGE, maximum: MAX_STAGE, example: 8 })
  @IsOptional()
  @IsInt()
  @Min(MIN_STAGE)
  @Max(MAX_STAGE)
  stageNumber?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
