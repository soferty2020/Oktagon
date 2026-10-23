import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Изменение профиля клуба (K1).
 *
 * Здесь только структурная проверка: типы и длины. Бизнес-правила — корректность
 * почты, IANA-имя часового пояса, абсолютная ссылка на логотип — проверяются в
 * сервисе, потому что их нельзя выразить декоратором и они должны быть покрыты
 * тестами.
 *
 * `ValidateIf` пропускает `null`: очистка поля — законная операция.
 */
export class UpdateClubProfileDto {
  @ApiPropertyOptional({ maxLength: 200, example: 'Карате-клуб OCTAGON' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true, example: 'https://cdn.octagon.kz/logo.png' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  @ApiPropertyOptional({ maxLength: 32, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  email?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({
    maxLength: 64,
    example: 'Asia/Almaty',
    description: 'IANA-имя часового пояса клуба',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}
