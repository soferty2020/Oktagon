import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AthleteStatus, BeltGrade, Gender } from '@octagon/contracts';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** Спортсмены (C4). */
export class CreateAthleteDto {
  @ApiProperty({ example: 'Али', maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Серик', maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @ApiPropertyOptional({
    description: 'Календарная дата в формате YYYY-MM-DD',
    example: '2015-09-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'birthDate должен быть датой в формате YYYY-MM-DD' })
  birthDate?: string;

  @ApiPropertyOptional({ enum: Object.values(Gender) })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 254 })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ description: 'Заметки клуба; родителю не отдаются', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateAthleteDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @ApiPropertyOptional({ example: '2015-09-01' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ enum: Object.values(Gender) })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 254 })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    example: 'kyu-8',
    description: 'Ступень из RankCatalog (ADR-0012); пояс выводится из неё',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  rank?: string;

  @ApiPropertyOptional({
    enum: Object.values(BeltGrade),
    description: 'Текущий пояс (K3); по умолчанию белый, очистить нельзя',
  })
  @IsOptional()
  @IsEnum(BeltGrade)
  beltGrade?: BeltGrade;

  @ApiPropertyOptional({
    example: '2024-02-10',
    nullable: true,
    description: 'Дата присвоения пояса, YYYY-MM-DD',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  beltAwardedAt?: string | null;

  @ApiPropertyOptional({
    enum: Object.values(AthleteStatus),
    description: 'BR-006: ACTIVE, FROZEN, ARCHIVED',
  })
  @IsOptional()
  @IsEnum(AthleteStatus)
  status?: AthleteStatus;

  /** Основной зал спортсмена (#66); `null` очищает привязку. */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  hallId?: string | null;
}

export class ListAthletesQueryDto {
  @ApiPropertyOptional({ enum: Object.values(AthleteStatus) })
  @IsOptional()
  @IsEnum(AthleteStatus)
  status?: AthleteStatus;

  @ApiPropertyOptional({ description: 'Поиск по фамилии, имени или отчеству' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

/** Связь аккаунта со спортсменом (C5). */
export class LinkAccountDto {
  @ApiProperty({ format: 'uuid', description: 'Аккаунт родителя или спортсмена' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ example: 'PARENT', description: 'PARENT, GUARDIAN, SELF' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  relation?: string;

  @ApiPropertyOptional({ description: 'Основной аккаунт спортсмена; он может быть один' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
