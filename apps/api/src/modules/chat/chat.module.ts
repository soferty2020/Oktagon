import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { ChatController, MessagesController } from './chat.controller';
import { ChatRepository, PrismaChatRepository } from './chat.repository';
import { ChatService } from './chat.service';

/**
 * Чаты: групповые и личные (эпик G3–G6, BR-012, ADR-0011, ADR-0012).
 *
 * Спецификация: docs/22-erd.md (Conversation, ConversationMember, Message),
 * docs/21-permission-matrix.md (`chat.use` и ограничение «own conversations»).
 *
 * `IdentityModule` нужен, чтобы узнать эффективные права вызывающего: от них
 * зависит, по каким группам искать чаты (тренер или представитель спортсмена).
 * Доступ к конкретной переписке правами не выражается — он определяется
 * участием, поэтому проверяется в сервисе (ADR-0011).
 */
@Module({
  imports: [IdentityModule],
  controllers: [ChatController, MessagesController],
  providers: [
    ChatService,
    PrismaChatRepository,
    { provide: ChatRepository, useExisting: PrismaChatRepository },
  ],
  exports: [ChatService],
})
export class ChatModule {}
