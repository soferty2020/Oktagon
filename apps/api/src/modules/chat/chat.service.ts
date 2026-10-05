import { Injectable } from '@nestjs/common';

/**
 * Заготовка модуля chat.
 *
 * Спецификация: BR-012, docs/01-mvp-scope.md (групповые и личные текстовые чаты), docs/22-erd.md (Conversation, Message).
 * Публичный контракт модуля согласуется до реализации
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Injectable()
export class ChatService {}
