import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PERMISSION_CODES, type PermissionCode } from '@octagon/contracts';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

/** Выдача индивидуального права (issue B5). */
export class GrantPermissionDto {
  @ApiProperty({ enum: PERMISSION_CODES, example: 'payments.view' })
  @IsIn(PERMISSION_CODES, {
    message: `code должен быть одним из: ${PERMISSION_CODES.join(', ')}`,
  })
  code!: PermissionCode;

  @ApiPropertyOptional({
    description: 'Срок действия в формате ISO-8601; не задан — бессрочно',
    example: '2026-12-31T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'expiresAt должен быть датой в формате ISO-8601' })
  expiresAt?: string;
}
