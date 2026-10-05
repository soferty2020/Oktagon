import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Даты заморозки задаются календарными днями без времени: заморозка учитывается
 * по датам, и время здесь только добавило бы путаницу с часовым поясом.
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateFreezeDto {
  @ApiProperty({
    description: 'Дата начала, YYYY-MM-DD; допускается задним числом',
    example: '2026-10-01',
  })
  @Matches(DATE_PATTERN, { message: 'startedOn должен быть датой в формате YYYY-MM-DD' })
  startedOn!: string;

  @ApiPropertyOptional({ maxLength: 500, example: 'Травма' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CloseFreezeDto {
  @ApiProperty({
    description: 'Дата завершения, YYYY-MM-DD; допускается задним числом',
    example: '2026-10-20',
  })
  @Matches(DATE_PATTERN, { message: 'endedOn должен быть датой в формате YYYY-MM-DD' })
  endedOn!: string;
}
