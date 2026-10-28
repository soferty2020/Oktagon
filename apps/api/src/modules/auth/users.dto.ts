import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/**
 * Смена статуса аккаунта (#56, SEC-15).
 *
 * Только два перехода: заблокировать и вернуть доступ. `INVITED` — состояние
 * приглашения, его выставляет приглашение, а не администратор.
 */
export class SetUserStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'BLOCKED'], example: 'BLOCKED' })
  @IsIn(['ACTIVE', 'BLOCKED'], { message: 'status должен быть ACTIVE или BLOCKED' })
  status!: 'ACTIVE' | 'BLOCKED';
}
