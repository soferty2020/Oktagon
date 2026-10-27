import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Ввод кода привязки: код диктуют голосом, поэтому 6–16 символов с запасом. */
export class LinkCodeDto {
  @ApiProperty({ example: 'K7M2P4QX', minLength: 6, maxLength: 16 })
  @IsString()
  @MinLength(6, { message: 'код слишком короткий' })
  @MaxLength(16)
  code!: string;
}

/** Заявка на привязку: что родитель знает о ребёнке. */
export class CreateLinkRequestDto {
  @ApiProperty({ example: 'Дмитрий' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ example: 'Сагабиев' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @ApiPropertyOptional({ example: '2020-08-24' })
  @IsOptional()
  @IsDateString({}, { message: 'дата рождения должна быть датой' })
  birthDate?: string;

  @ApiPropertyOptional({ example: '+79672131616' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}

export class ApproveLinkRequestDto {
  @ApiProperty({ description: 'Идентификатор карточки, к которой привязываем' })
  @IsString()
  athleteId!: string;
}

export class RejectLinkRequestDto {
  @ApiProperty({ example: 'Не совпадает дата рождения' })
  @IsString()
  @MinLength(3, { message: 'укажите причину отказа' })
  @MaxLength(300)
  reason!: string;
}
