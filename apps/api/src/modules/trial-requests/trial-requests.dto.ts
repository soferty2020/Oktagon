import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { TrialRequestStatus } from '@octagon/contracts';

/**
 * Публичная заявка (ADR-0013).
 *
 * Обязательны только имя и телефон: если требовать больше, человек закроет форму.
 * `website` — honeypot: люди его не видят, боты заполняют.
 */
export class CreateTrialRequestDto {
  @ApiProperty({ example: 'Анна', maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: '+7 999 123-45-67', maxLength: 32 })
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ example: 'Максим', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  childName?: string;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(18)
  childAge?: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ example: 'site', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  /** Honeypot: заполнено — заявка от бота. */
  @ApiPropertyOptional({ description: 'Служебное поле; люди его не заполняют' })
  @IsOptional()
  @IsString()
  website?: string;
}

/** Смена статуса администратором. */
export class UpdateTrialRequestDto {
  @ApiProperty({ enum: Object.values(TrialRequestStatus) })
  @IsEnum(TrialRequestStatus)
  status!: TrialRequestStatus;
}
