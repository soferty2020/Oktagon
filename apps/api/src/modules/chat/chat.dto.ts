import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Создание диалога (BR-012, ADR-0012).
 *
 * Ровно одно из двух: `groupId` для группового чата группы или `participantIds`
 * для личного диалога.
 *
 * Взаимоисключение и число собеседников проверяет сервис, а не DTO: это
 * бизнес-правила, и они должны отвечать кодами `CONVERSATION_TYPE_INVALID` и
 * `CONVERSATION_PARTICIPANTS_INVALID`. Проверка в DTO вернула бы общий
 * `VALIDATION_FAILED`, и клиент не понял бы, что именно нарушено.
 */
export class CreateConversationDto {
  @ApiPropertyOptional({ description: 'Группа для группового чата', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({
    description: 'Собеседники личного диалога: ровно один, без текущего пользователя',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  participantIds?: string[];
}

export class SendMessageDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1, { message: 'сообщение не может быть пустым' })
  @MaxLength(4000)
  body!: string;
}

/** Пагинация истории: курсор — дата самого старого показанного сообщения. */
export class ListMessagesQueryDto {
  @ApiPropertyOptional({
    description: 'Курсор: отдать сообщения старше этой даты (ISO 8601)',
  })
  @IsOptional()
  @IsString()
  olderThan?: string;
}
