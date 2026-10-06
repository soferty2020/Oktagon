/**
 * Контракт чатов (BR-012, ADR-0011, ADR-0012).
 *
 * BR-012: «Участники группового чата видят сообщения друг друга. Родитель и
 * тренер могут оба инициировать личный диалог».
 *
 * Доступ определяется **участием**, а не ролью: `chat.use` у STAFF — это
 * разрешение на функцию, а не доступ к конкретной переписке. Тренер без общей
 * группы не видит диалог родителя, даже имея это право (docs/21-permission-matrix.md).
 *
 * Вложений, реакций, голосовых и правки сообщений в MVP нет
 * (docs/01-mvp-scope.md), поэтому протокол текстовый.
 */

import type { ConversationMemberRole, ConversationType } from './domain';

export type { ConversationMemberRole, ConversationType };

/** Участник диалога: интерфейсу нужно имя и признак тренера. */
export interface ConversationMemberView {
  userId: string;
  firstName: string;
  lastName: string;
  /**
   * Роль участника в диалоге.
   *
   * Для родителя важно, отвечает ли ему тренер или другой родитель, поэтому
   * признак отдается в интерфейс, а не выводится из роли аккаунта: в групповом
   * чате встречаются и те, и другие.
   */
  role: ConversationMemberRole;
}

/** Сообщение диалога. */
export interface MessageView {
  id: string;
  conversationId: string;
  sender: ConversationMemberView;
  /**
   * Текст сообщения.
   *
   * У удаленного сообщения пустой: `deletedAt` сохраняется, а текст не отдается,
   * чтобы удаленное нельзя было прочитать через API (ADR-0012).
   */
  body: string;
  /** Сообщение удалено: в переписке остается след, что оно было. */
  isDeleted: boolean;
  /** Может ли текущий пользователь удалить сообщение (только отправитель). */
  canDelete: boolean;
  createdAt: string;
}

/** Диалог: групповой чат группы или личная переписка. */
export interface ConversationView {
  id: string;
  type: ConversationType;
  /**
   * Название диалога.
   *
   * У группового чата — имя группы, у личного — имя собеседника: у личной
   * переписки нет названия, которое можно было бы хранить.
   */
  title: string;
  /** Группа группового чата; у личного диалога `null`. */
  groupId: string | null;
  participants: ConversationMemberView[];
  /** Последнее сообщение; у пустого диалога `null`. */
  lastMessage: MessageView | null;
  /** Сообщения после `lastReadAt`, отправленные не текущим пользователем. */
  unreadCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

/** Диалог с историей сообщений. */
export interface ConversationDetails extends ConversationView {
  /** Сообщения от старых к новым. */
  messages: MessageView[];
  /** Курсор для загрузки более старых сообщений; `null` — история исчерпана. */
  olderCursor: string | null;
}

/**
 * Создание диалога.
 *
 * Ровно одно из двух: `groupId` для группового чата группы или `participantIds`
 * для личного диалога (ADR-0012).
 */
export interface CreateConversationInput {
  groupId?: string;
  /** Собеседники личного диалога без текущего пользователя. */
  participantIds?: string[];
}

export interface SendMessageInput {
  body: string;
}
