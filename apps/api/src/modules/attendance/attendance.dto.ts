import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus } from '@octagon/contracts';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Максимум отметок за один запрос: список группы ограничен разумным размером. */
const MAX_MARKS = 200;

/** Одна отметка в запросе. */
export class AttendanceMarkDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  athleteId!: string;

  @ApiProperty({ enum: Object.values(AttendanceStatus), example: 'PRESENT' })
  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;

  @ApiPropertyOptional({ maxLength: 500, description: 'Комментарий тренера' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

/**
 * Сохранение отметок.
 *
 * Передаются только измененные спортсмены: тренер отмечает по ходу занятия, а не
 * заполняет весь список сразу. Повторная отметка обновляет статус.
 */
export class SaveAttendanceDto {
  @ApiProperty({ type: [AttendanceMarkDto] })
  @IsArray()
  @ArrayMaxSize(MAX_MARKS)
  @ValidateNested({ each: true })
  @Type(() => AttendanceMarkDto)
  marks!: AttendanceMarkDto[];
}

/** Сообщение о планируемом отсутствии (BR-008). */
export class ReportPlannedAbsenceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  athleteId!: string;

  @ApiPropertyOptional({ maxLength: 500, example: 'Поездка с семьей' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Период сводки посещаемости. */
export class AttendanceSummaryQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Группа; без нее сводка не строится' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ description: 'Начало периода, ISO-8601; включительно' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Конец периода, ISO-8601; исключительно' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

/** Период истории посещений спортсмена. */
export class AthleteHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Начало периода, ISO-8601; по умолчанию 90 дней назад' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Конец периода, ISO-8601; по умолчанию сейчас' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
