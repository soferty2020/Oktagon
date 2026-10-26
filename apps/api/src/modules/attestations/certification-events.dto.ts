import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Мероприятие аттестации (#33).
 *
 * Статус здесь не принимается: он меняется отдельными действиями (`/cancel`,
 * `/complete`, `/publish`). Иначе клиент мог бы «обновить» статус в обход
 * проверки переходов и, например, опубликовать черновик.
 */
export class CreateCertificationEventDto {
  @ApiProperty({ example: 'Осенняя аттестация', maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: '2026-11-15T10:00:00.000Z', description: 'Дата и время экзамена' })
  @IsDateString()
  scheduledAt!: string;

  @ApiPropertyOptional({ example: 'Зал 1', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ example: 'Федерация киокушин', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  organizer?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

/** Правка мероприятия: заполняемые поля, статус — отдельными действиями. */
export class UpdateCertificationEventDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: '2026-11-15T10:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  organizer?: string | null;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
