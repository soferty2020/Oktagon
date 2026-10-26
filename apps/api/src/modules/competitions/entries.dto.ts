import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import {
  CompetitionDiscipline,
  CompetitionEntryResult,
  CompetitionMedal,
  CompetitionMatchResult,
  ParticipantPaymentStatus,
} from '@octagon/contracts';

/** Категория справочника (#37). */
export class CreateCategoryDto {
  @ApiProperty({ enum: Object.values(CompetitionDiscipline) })
  @IsEnum(CompetitionDiscipline)
  discipline!: CompetitionDiscipline;

  @ApiProperty({ example: 'Юноши 12–13 лет, до 45 кг', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(80)
  ageFrom?: number;

  @ApiPropertyOptional({ example: 13 })
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(80)
  ageTo?: number;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsNumber()
  weightFrom?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  weightTo?: number;

  @ApiPropertyOptional({ example: 'kyu-10', description: 'Ступень от' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  beltFrom?: string;

  @ApiPropertyOptional({ example: 'kyu-6', description: 'Ступень до' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  beltTo?: string;

  @ApiPropertyOptional({ description: 'Категория конкретного турнира; пусто — общая' })
  @IsOptional()
  @IsUUID()
  competitionId?: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  ageFrom?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  ageTo?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  weightFrom?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  weightTo?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  beltFrom?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  beltTo?: string | null;

  @ApiPropertyOptional({ description: 'Снять с публикации, не удаляя историю' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Спортсмен в турнире (#37): одна оплата на турнир. */
export class AddCompetitionParticipantDto {
  @ApiProperty()
  @IsUUID()
  athleteId!: string;

  @ApiPropertyOptional({ description: 'Ответственный тренер; по умолчанию — текущий' })
  @IsOptional()
  @IsUUID()
  responsibleTrainerId?: string;
}

/** Оплата участия в турнире. */
export class SetCompetitionPaymentDto {
  @ApiProperty({ enum: Object.values(ParticipantPaymentStatus) })
  @IsEnum(ParticipantPaymentStatus)
  paymentStatus!: ParticipantPaymentStatus;
}

/** Участие в дисциплине и категории. */
export class AddEntryDto {
  @ApiProperty({ enum: Object.values(CompetitionDiscipline) })
  @IsEnum(CompetitionDiscipline)
  discipline!: CompetitionDiscipline;

  @ApiProperty({ description: 'Категория из справочника или турнирная' })
  @IsUUID()
  categoryId!: string;
}

/** Итог участия (#38). */
export class RecordEntryResultDto {
  @ApiProperty({ enum: Object.values(CompetitionEntryResult) })
  @IsEnum(CompetitionEntryResult)
  result!: CompetitionEntryResult;

  @ApiPropertyOptional({ example: 1, description: 'Обязательно при PLACED' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  place?: number;

  @ApiPropertyOptional({ enum: Object.values(CompetitionMedal) })
  @IsOptional()
  @IsEnum(CompetitionMedal)
  medal?: CompetitionMedal;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiPropertyOptional({ maxLength: 500, description: 'Причина исправления опубликованного результата' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Встреча в кумитэ (#38). */
export class AddMatchDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(20)
  round!: number;

  @ApiProperty({ example: 'Иванов И.', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  opponentName!: string;

  @ApiPropertyOptional({ example: 'Клуб «Титан»', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  opponentClub?: string;

  @ApiProperty({ enum: Object.values(CompetitionMatchResult) })
  @IsEnum(CompetitionMatchResult)
  result!: CompetitionMatchResult;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
