import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TrainingSessionStatus,
  Weekday,
} from '@octagon/contracts';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_MESSAGE = 'Время должно быть в формате HH:mm';

/** Создание шаблона расписания на квартал. */
export class CreateScheduleTemplateDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  groupId!: string;

  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @ApiProperty({ example: 1, minimum: 1, maximum: 4 })
  @IsInt()
  @Min(1)
  @Max(4)
  quarter!: number;
}

export class AddScheduleSlotDto {
  @ApiProperty({ enum: Object.values(Weekday), example: 'WEDNESDAY' })
  @IsEnum(Weekday)
  weekday!: Weekday;

  @ApiProperty({ example: '18:00' })
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  startTime!: string;

  @ApiProperty({ example: '19:30' })
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  endTime!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  hallId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Профиль тренера, не аккаунт' })
  @IsOptional()
  @IsUUID()
  trainerId?: string;
}

export class UpdateScheduleSlotDto {
  @ApiPropertyOptional({ enum: Object.values(Weekday) })
  @IsOptional()
  @IsEnum(Weekday)
  weekday?: Weekday;

  @ApiPropertyOptional({ example: '18:00' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  startTime?: string;

  @ApiPropertyOptional({ example: '19:30' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  endTime?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  hallId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  trainerId?: string | null;
}

export class ListTemplatesQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;
}

export class GenerateSessionsDto {
  @ApiPropertyOptional({
    description:
      'Пересоздать занятия: удаляются только те, что еще не начались. Отмененные вручную занятия сохраняются.',
  })
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;
}

/** Фильтры списка занятий. */
export class ListSessionsQueryDto {
  @ApiPropertyOptional({ description: 'Начало периода, ISO-8601; включительно' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Конец периода, ISO-8601; исключительно' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  trainerId?: string;

  @ApiPropertyOptional({ enum: Object.values(TrainingSessionStatus) })
  @IsOptional()
  @IsEnum(TrainingSessionStatus)
  status?: TrainingSessionStatus;
}

/**
 * Занятие, добавленное вручную.
 *
 * Время задается локальным временем клуба: администратор вводит «7 октября
 * 18:00», а не UTC. Нужно для занятий задним числом (клуб начал работать
 * раньше, чем появилась система) и для разовых занятий вне расписания.
 */
export class CreateSessionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  groupId!: string;

  @ApiProperty({ description: 'Календарная дата, YYYY-MM-DD', example: '2026-10-07' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date должен быть датой в формате YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ example: '18:00' })
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  startTime!: string;

  @ApiProperty({ example: '19:30', description: 'Допускается переход через полночь' })
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  endTime!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  hallId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Профиль тренера, не аккаунт' })
  @IsOptional()
  @IsUUID()
  trainerId?: string;

  @ApiProperty({
    description: 'Зачем добавлено занятие: попадает в карточку занятия',
    example: 'Занесение занятий за прошлый месяц',
  })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

/** Точечный перенос занятия (BR-009). */
export class MoveSessionDto {
  @ApiProperty({ description: 'Новое начало, ISO-8601 (UTC)' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ description: 'Новое окончание, ISO-8601 (UTC)' })
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  hallId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  trainerId?: string | null;

  @ApiProperty({ description: 'Причина переноса: попадает в карточку занятия', example: 'Карантин в школе' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

/** Отмена занятия: причина обязательна (BR-009). */
export class CancelSessionDto {
  @ApiProperty({ example: 'Низкая температура в зале' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}
