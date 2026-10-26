import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ParticipantAdmission, ParticipantPaymentStatus, ParticipantResult } from '@octagon/contracts';

/** Добавление участника (#34). */
export class AddParticipantDto {
  @ApiProperty({ description: 'Спортсмен' })
  @IsUUID()
  athleteId!: string;

  @ApiProperty({ example: 'kyu-8', description: 'Ступень, на которую сдаёт' })
  @IsString()
  @MaxLength(16)
  targetRank!: string;

  @ApiPropertyOptional({
    description: 'Ответственный тренер; по умолчанию — тренер, добавляющий участника',
  })
  @IsOptional()
  @IsUUID()
  responsibleTrainerId?: string;
}

/** Допуск и целевая ступень. Оплата сюда не входит: её меняет только руководитель. */
export class UpdateParticipantDto {
  @ApiPropertyOptional({ example: 'kyu-8' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  targetRank?: string;

  @ApiPropertyOptional({ enum: Object.values(ParticipantAdmission) })
  @IsOptional()
  @IsEnum(ParticipantAdmission)
  admission?: ParticipantAdmission;
}

/** Оплата: отдельный эндпоинт, потому что право другое. */
export class SetParticipantPaymentDto {
  @ApiProperty({ enum: Object.values(ParticipantPaymentStatus) })
  @IsEnum(ParticipantPaymentStatus)
  paymentStatus!: ParticipantPaymentStatus;
}

/** Итог участника (#35). */
export class RecordResultDto {
  @ApiProperty({ enum: Object.values(ParticipantResult) })
  @IsEnum(ParticipantResult)
  result!: ParticipantResult;

  @ApiPropertyOptional({
    example: 'kyu-8',
    description: 'Присвоенная ступень при PASSED; может отличаться от целевой при переходе через ступени',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  awardedRank?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Причина исправления: обязательна, если итог уже был сохранён',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
