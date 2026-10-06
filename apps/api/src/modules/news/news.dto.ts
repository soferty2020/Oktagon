import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NewsStatus } from '@octagon/contracts';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Создание новости (BR-011). */
export class CreateNewsPostDto {
  @ApiProperty({ example: 'Изменение расписания на праздники', maxLength: 200 })
  @IsString()
  @MinLength(1, { message: 'заголовок не может быть пустым' })
  @MaxLength(200)
  title!: string;

  @ApiProperty({ maxLength: 10000 })
  @IsString()
  @MinLength(1, { message: 'текст новости не может быть пустым' })
  @MaxLength(10000)
  body!: string;

  @ApiPropertyOptional({
    description: 'true — опубликовать сразу; иначе новость останется черновиком',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;

  @ApiPropertyOptional({ description: 'Закрепить в ленте', default: false })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class UpdateNewsPostDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class CreateNewsCommentDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(1, { message: 'комментарий не может быть пустым' })
  @MaxLength(2000)
  body!: string;
}

/**
 * Фильтр списка новостей.
 *
 * По умолчанию отдаются опубликованные: черновики попадают в список только по
 * явному запросу и только автору или модератору (ADR-0011).
 */
export class ListNewsQueryDto {
  @ApiPropertyOptional({ enum: Object.values(NewsStatus) })
  @IsOptional()
  @IsEnum(NewsStatus)
  status?: NewsStatus;

  @ApiPropertyOptional({ description: 'Поиск по заголовку и тексту' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Включить архивные записи', default: false })
  @IsOptional()
  @IsBoolean()
  includeArchived?: boolean;
}
