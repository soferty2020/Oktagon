import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Вход по email и паролю (docs/09-api.md).
 *
 * Валидация на границе API обязательна (docs/15-security.md).
 */
export class LoginDto {
  @ApiProperty({ example: 'parent@example.com' })
  @IsEmail({}, { message: 'email должен быть корректным адресом' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Correct-Horse-Battery', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'пароль должен быть не короче 8 символов' })
  @MaxLength(128)
  password!: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh-токен, полученный при входе' })
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Refresh-токен текущей сессии' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

/**
 * Регистрация родителя (ADR-0015).
 *
 * Аккаунт создаётся активным, но без детей: до привязки по коду или заявке
 * родитель видит только общие разделы клуба.
 */
export class RegisterDto {
  @ApiProperty({ example: 'parent@example.com' })
  @IsEmail({}, { message: 'email должен быть корректным адресом' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Correct-Horse-Battery', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'пароль должен быть не короче 8 символов' })
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'Ольга' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ example: 'Сагабиева' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @ApiPropertyOptional({ example: '+79672131616' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}