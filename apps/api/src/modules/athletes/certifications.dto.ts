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

  @ApiProperty({ example: 'YELLOW', description: 'Присвоенный пояс из справочника' })
  @IsString()
  @MaxLength(64)
  beltGrade!: string;

  @ApiProperty({ enum: Object.values(CertificationStageKind) })
  @IsEnum(CertificationStageKind)
  stageKind!: CertificationStageKind;

  @ApiProperty({ minimum: MIN_STAGE, maximum: MAX_STAGE, example: 8 })
  @IsInt()
  @Min(MIN_STAGE)
  @Max(MAX_STAGE)
  stageNumber!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
