import { Module } from '@nestjs/common';

import { ChatService } from './chat.service';

/**
 * Модуль chat.
 *
 * Спецификация: BR-012, docs/01-mvp-scope.md (групповые и личные текстовые чаты), docs/22-erd.md (Conversation, Message).
 * Публичный контракт и бизнес-логика добавляются отдельным issue
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Module({
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
