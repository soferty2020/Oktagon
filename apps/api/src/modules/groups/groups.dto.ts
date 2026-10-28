import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Группы (C6). */
export class CreateGroupDto {
  @ApiProperty({ example: 'Дети 7-9 лет', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Зал группы (#65): без него группа не привязана к площадке. */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  hallId?: string | null;
}

export class UpdateGroupDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Перенос группы в другой зал' })
  @IsOptional()
  @IsUUID()
  hallId?: string | null;

  @ApiPropertyOptional({ description: 'false — группа временно не набирается' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListGroupsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Поиск по названию' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

/** Привязка филиала к группе (C7). */
export class AssignGroupBranchDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  branchId!: string;

  @ApiPropertyOptional({ description: 'Основной филиал группы; он может быть один' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

/** Назначение тренера на группу (C7). */
export class AssignGroupTrainerDto {
  @ApiProperty({ format: 'uuid', description: 'Идентификатор профиля тренера' })
  @IsUUID()
  trainerId!: string;

  @ApiPropertyOptional({ description: 'Основной тренер группы; он может быть один' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

/** Добавление спортсмена в группу (C8). */
export class AddGroupMemberDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  athleteId!: string;

  @ApiPropertyOptional({
    description: 'Дата вступления в формате YYYY-MM-DD; по умолчанию сегодня',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'joinedAt должен быть датой' })
  joinedAt?: string;
}
