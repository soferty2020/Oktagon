import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@octagon/contracts';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
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

  @ApiPropertyOptional({ description: 'Идентификатор приглашения (альтернатива токену)' })
  @IsOptional()
  @IsUUID()
  inviteId?: string;

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
