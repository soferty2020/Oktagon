import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  UserRole,
  UserStatus,
} from '@octagon/contracts';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Фильтры списка пользователей (GET /users).
 *
 * Пагинация ограничена сверху MAX_PAGE_SIZE: без ограничения один запрос мог бы
 * выгрузить всю таблицу пользователей.
 */
export class ListUsersQueryDto {
  @ApiPropertyOptional({ enum: Object.values(UserRole) })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: Object.values(UserStatus) })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'Поиск по email, фамилии или имени' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  perPage?: number;
}
