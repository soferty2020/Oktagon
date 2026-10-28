import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@octagon/contracts';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Приглашение пользователя администратором. */
export class CreateInviteDto {
  @ApiProperty({ example: 'trainer@example.com' })
  @IsEmail({}, { message: 'email должен быть корректным адресом' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ enum: Object.values(UserRole), example: 'STAFF' })
  @IsEnum(UserRole, { message: 'role должна быть одной из: MEMBER, STAFF, SUPERADMIN' })
  role!: UserRole;
}

/** Принятие приглашения: пользователь задает пароль и профиль. */
export class AcceptInviteDto {
  @ApiPropertyOptional({ description: 'Токен приглашения' })
  @IsOptional()
  @IsString()
  @MinLength(16)
  token?: string;

  @ApiProperty({ example: 'trainer@example.com' })
  @IsEmail({}, { message: 'email должен быть корректным адресом' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'пароль должен быть не короче 8 символов' })
  @MaxLength(128)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}

/** Фильтр списка приглашений. */
export class ListInvitesQueryDto {
  @ApiPropertyOptional({ description: 'Фильтр по email' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

/**
 * Принятие приглашения по коду (ADR-0014).
 *
 * Отдельный DTO, а не расширение `AcceptInviteDto`: код и токен — разные способы
 * предъявить одно приглашение, и смешивать их в одном теле значило бы разрешить
 * «токен или код, что первым придёт».
 */
export class AcceptInviteCodeDto {
  @ApiProperty({ example: 'K7M2P4QX', description: 'Код из 8 символов' })
  @IsString()
  @MinLength(6)
  @MaxLength(16)
  code!: string;

  @ApiProperty({ example: 'trainer@example.com' })
  @IsEmail({}, { message: 'email должен быть корректным адресом' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'пароль должен быть не короче 8 символов' })
  @MaxLength(128)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}