import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  ConversationMemberRole,
  ConversationType,
  PermissionCode,
  type ConversationDetails,
  type ConversationMemberView,
  type ConversationView,
  type CreateConversationInput,
  type MessageView,
  type SendMessageInput,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { IdentityService } from '../identity/identity.service';
import { ChatRepository } from './chat.repository';
import type { ConversationRecord, MemberRecord, MessageRecord } from './chat.repository';

/** Сколько сообщений отдается за один запрос истории. */
const MESSAGE_PAGE_SIZE = 50;

/**
 * Чаты клуба: групповые и личные (BR-012, ADR-0011, ADR-0012).
 *
 * Ключевые правила:
 *
 * 1. **доступ — по участию, а не по роли.** Права на чат не требуются: матрица
 *    прав описывает чат как ресурс («own conversations» для MEMBER, «assigned
 *    conversations» для STAFF). У роли MEMBER базовых прав нет, и требование
 *    `chat.use` не дало бы родителю написать тренеру, хотя BR-012 это разрешает;
 * 2. **групповой чат создается при первом обращении**, а состав участников
 *    вычисляется по группе (ADR-0012);
 * 3. **личный диалог один на пару участников**: повторный запрос возвращает
 *    существующий;
 * 4. **непрочитанные** считаются от `lastReadAt` и не включают собственные
 *    сообщения.
 *
 * Состав группового чата проверяется на каждом обращении, а не один раз при
 * входе: спортсмен может уйти из группы между открытием списка и отправкой
 * сообщения, и доступ должен закрыться.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly chat: ChatRepository,
    private readonly identity: IdentityService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Список диалогов пользователя.
   *
   * Групповые чаты добавляются в список в момент обращения: так родитель видит
   * чат группы, в которой занимается ребенок, не дожидаясь, пока кто-то напишет
   * первым (ADR-0012 — чат создается лениво).
   */
  async list(callerUserId: string): Promise<ConversationView[]> {
    await this.syncGroupConversations(callerUserId);

    const conversations = await this.chat.listConversationsForUser(callerUserId);
    const views: ConversationView[] = [];

    for (const conversation of conversations) {
      try {
        // Список фильтруется той же проверкой, что и открытие диалога. Иначе
        // после выхода из группы чат оставался бы виден в списке, хотя открыть
        // его нельзя: пользователь видел бы диалог, который ему уже недоступен.
        await this.requireAccess(callerUserId, conversation.id);
      } catch {
        continue;
      }

      views.push(await this.toView(conversation, callerUserId));
    }

    return views.sort((left, right) => {
      const leftAt = left.lastMessageAt ?? left.createdAt;
      const rightAt = right.lastMessageAt ?? right.createdAt;
      return rightAt.localeCompare(leftAt);
    });
  }

  /** История диалога. Чтение сдвигает `lastReadAt`. */
  async get(
    callerUserId: string,
    conversationId: string,
    olderThan?: string,
  ): Promise<ConversationDetails> {
    const conversation = await this.requireAccess(callerUserId, conversationId);

    const olderDate = olderThan ? new Date(olderThan) : undefined;
    if (olderDate && Number.isNaN(olderDate.getTime())) {
      throw new ApiException('VALIDATION_FAILED' satisfies ApiErrorCode, 'Некорректный курсор');
    }

    const messages = await this.chat.listMessages(conversationId, {
      olderThan: olderDate,
      limit: MESSAGE_PAGE_SIZE,
    });

    const view = await this.toView(conversation, callerUserId);

    // Прочитанным считается то, что пользователь действительно открыл. Отметка
    // ставится после чтения: `lastReadAt` не должен опережать отданные данные.
    await this.chat.markRead(conversationId, callerUserId, new Date());

    return {
      ...view,
      unreadCount: 0,
      messages: messages.map((message) => toMessageView(message, callerUserId)),
      // Курсор отдается, только если страница заполнена: иначе клиент сделал бы
      // лишний запрос за пустой страницей.
      olderCursor:
        messages.length === MESSAGE_PAGE_SIZE
          ? (messages[0]?.createdAt.toISOString() ?? null)
          : null,
    };
  }

  /**
   * Создание диалога: группового чата группы или личной переписки.
   *
   * BR-012: и родитель, и тренер могут начать личный диалог, поэтому отдельного
   * права на создание нет — достаточно быть участником клуба.
   */
  async create(callerUserId: string, input: CreateConversationInput): Promise<ConversationView> {
    if (input.groupId && input.participantIds?.length) {
      throw new ApiException(
        'CONVERSATION_TYPE_INVALID' satisfies ApiErrorCode,
        'Укажите либо groupId для группового чата, либо участников для личного диалога',
      );
    }

    if (input.groupId) {
      return this.createOrGetGroup(callerUserId, input.groupId);
    }

    return this.createOrGetDirect(callerUserId, input.participantIds ?? []);
  }

  /** Отправка сообщения: только участник диалога. */
  async sendMessage(
    callerUserId: string,
    conversationId: string,
    input: SendMessageInput,
  ): Promise<MessageView> {
    await this.requireAccess(callerUserId, conversationId);

    const body = input.body.trim();
    if (!body) {
      throw new ApiException('VALIDATION_FAILED' satisfies ApiErrorCode, 'Сообщение пусто');
    }

    const message = await this.chat.createMessage({
      conversationId,
      senderId: callerUserId,
      body,
    });

    // Отправка не аудируется: BR-007 перечисляет оплаты, заморозки, права и
    // расписание, а переписка — не тот случай, когда нужен след в аудите.
    return toMessageView(message, callerUserId);
  }

  /**
   * Удаление сообщения.
   *
   * Удаляет только отправитель: модерации чужих сообщений в MVP нет, для нее
   * понадобилось бы отдельное право, которого нет в каталоге (ADR-0012).
   * Удаление мягкое — в переписке остается след, что сообщение было.
   */
  async deleteMessage(
    callerUserId: string,
    messageId: string,
  ): Promise<{ id: string; isDeleted: true }> {
    const message = await this.chat.findMessage(messageId);
    if (!message || message.deletedAt) {
      throw new ApiException('MESSAGE_NOT_FOUND' satisfies ApiErrorCode, 'Сообщение не найдено');
    }

    // Сообщение сначала проверяется на доступ, потом на авторство: иначе чужой
    // идентификатор сообщения отвечал бы «не ваше» вместо «не найдено», и по
    // разнице ответов можно было бы выяснить, что сообщение существует.
    await this.requireAccess(callerUserId, message.conversationId);

    if (message.senderId !== callerUserId) {
      throw new ApiException(
        'FORBIDDEN' satisfies ApiErrorCode,
        'Удалить можно только свое сообщение',
      );
    }

    await this.chat.softDeleteMessage(messageId, new Date());

    await this.audit.recordSafely({
      action: AuditAction.MESSAGE_DELETED,
      entityType: AuditEntityType.MESSAGE,
      entityId: messageId,
      before: { conversationId: message.conversationId, senderId: message.senderId },
    });

    return { id: messageId, isDeleted: true };
  }

  // --- Создание диалогов ---------------------------------------------------

  private async createOrGetGroup(callerUserId: string, groupId: string): Promise<ConversationView> {
    const group = await this.chat.findGroup(groupId);
    if (!group) {
      throw new ApiException('CONVERSATION_NOT_FOUND' satisfies ApiErrorCode, 'Группа не найдена');
    }

    const participants = await this.chat.groupParticipants(groupId);
    if (!participants.some((participant) => participant.userId === callerUserId)) {
      // В чат группы попадают только тренеры и представители ее спортсменов
      // (ADR-0012): посторонний не должен получить доступ к переписке по
      // идентификатору группы.
      throw new ApiException(
        'CONVERSATION_ACCESS_DENIED' satisfies ApiErrorCode,
        'Чат доступен тренерам группы и представителям ее спортсменов',
      );
    }

    let conversation = await this.chat.findGroupConversation(groupId);
    if (!conversation) {
      conversation = await this.chat.createConversation({
        type: ConversationType.GROUP,
        title: group.name,
        groupId,
      });

      await this.audit.recordSafely({
        action: AuditAction.CONVERSATION_CREATED,
        entityType: AuditEntityType.CONVERSATION,
        entityId: conversation.id,
        after: { type: 'GROUP', groupId },
      });
    }

    await this.syncMembers(conversation.id, groupId);

    return this.toView(conversation, callerUserId);
  }

  private async createOrGetDirect(
    callerUserId: string,
    participantIds: string[],
  ): Promise<ConversationView> {
    const unique = [...new Set(participantIds)].filter((id) => id !== callerUserId);
    const [counterpart] = unique;

    if (unique.length !== 1 || !counterpart) {
      // BR-012 говорит про диалог родителя и тренера — это разговор двух сторон.
      throw new ApiException(
        'CONVERSATION_PARTICIPANTS_INVALID' satisfies ApiErrorCode,
        'Личный диалог создается ровно с одним собеседником',
      );
    }

    const userIds = [callerUserId, counterpart];
    const existing = await this.chat.findDirectConversation(userIds);
    if (existing) {
      return this.toView(existing, callerUserId);
    }

    const conversation = await this.chat.createConversation({
      type: ConversationType.DIRECT,
      title: null,
      groupId: null,
    });

    await this.chat.addMembers(conversation.id, [
      { userId: callerUserId, role: ConversationMemberRole.MEMBER },
      { userId: counterpart, role: ConversationMemberRole.MEMBER },
    ]);

    await this.audit.recordSafely({
      action: AuditAction.CONVERSATION_CREATED,
      entityType: AuditEntityType.CONVERSATION,
      entityId: conversation.id,
      after: { type: 'DIRECT', participants: userIds },
    });

    return this.toView(conversation, callerUserId);
  }

  // --- Доступ --------------------------------------------------------------

  /**
   * Диалог, к которому у вызывающего есть доступ.
   *
   * Недоступный диалог отдает 404, а не 403: по коду ответа нельзя выяснить,
   * существует ли переписка, в которой вызывающий не участвует.
   */
  private async requireAccess(
    callerUserId: string,
    conversationId: string,
  ): Promise<ConversationRecord> {
    const conversation = await this.chat.findConversation(conversationId);
    if (!conversation) {
      throw new ApiException('CONVERSATION_NOT_FOUND' satisfies ApiErrorCode, 'Диалог не найден');
    }

    if (conversation.type === ConversationType.GROUP && conversation.groupId) {
      // Состав синхронизируется до проверки доступа и независимо от списка групп
      // пользователя: вышедший из группы в этом списке уже не значится, и без
      // синхронизации его запись участника навсегда осталась бы действительной.
      await this.syncMembers(conversation.id, conversation.groupId);

      const inGroup = await this.isInGroup(callerUserId, conversation.groupId);
      if (!inGroup) {
        throw new ApiException('CONVERSATION_NOT_FOUND' satisfies ApiErrorCode, 'Диалог не найден');
      }
    }

    const isMember = await this.chat.isMember(conversationId, callerUserId);
    if (!isMember) {
      throw new ApiException('CONVERSATION_NOT_FOUND' satisfies ApiErrorCode, 'Диалог не найден');
    }

    return conversation;
  }

  /** Участвует ли пользователь в группе: тренер или представитель спортсмена. */
  private async isInGroup(callerUserId: string, groupId: string): Promise<boolean> {
    const participants = await this.chat.groupParticipants(groupId);
    return participants.some((participant) => participant.userId === callerUserId);
  }

  /**
   * Приводит чаты групп в соответствие текущему составу групп пользователя.
   *
   * Вызывается при обращении к списку и к конкретному диалогу: состав группы мог
   * измениться после создания чата (ADR-0012). Здесь же закрывается доступ
   * ушедшим: без этого запись участника оставалась бы действительной.
   */
  private async syncGroupConversations(callerUserId: string): Promise<void> {
    const groupIds = await this.groupsOfUser(callerUserId);

    for (const groupId of groupIds) {
      const conversation = await this.chat.findGroupConversation(groupId);
      const participants = await this.chat.groupParticipants(groupId);
      const inGroup = participants.some((participant) => participant.userId === callerUserId);

      if (!inGroup) {
        continue;
      }

      if (!conversation) {
        // Чат группы создается по факту обращения участника: до этого момента
        // пустой чат никому не нужен (ADR-0012).
        const group = await this.chat.findGroup(groupId);
        const created = await this.chat.createConversation({
          type: ConversationType.GROUP,
          title: group?.name ?? null,
          groupId,
        });

        await this.audit.recordSafely({
          action: AuditAction.CONVERSATION_CREATED,
          entityType: AuditEntityType.CONVERSATION,
          entityId: created.id,
          after: { type: 'GROUP', groupId },
        });

        await this.writeMembers(created.id, participants);
        continue;
      }

      await this.syncMembers(conversation.id, groupId);
    }
  }

  /**
   * Синхронизирует участников чата с составом группы.
   *
   * Новые дописываются, вышедшие помечаются `leftAt`. Пометить, а не удалить:
   * у участника остается `lastReadAt`, и при возвращении в группу прочитанное не
   * покажется новым.
   */
  private async syncMembers(conversationId: string, groupId: string): Promise<void> {
    const participants = await this.chat.groupParticipants(groupId);
    const members = await this.chat.listMembers(conversationId);
    const inGroup = new Set(participants.map((participant) => participant.userId));

    const missing = participants.filter(
      (participant) => !members.some((member) => member.userId === participant.userId),
    );

    const left = members
      .filter((member) => !inGroup.has(member.userId))
      .map((member) => member.userId);

    if (missing.length > 0) {
      await this.writeMembers(conversationId, missing);
      this.logger.log(`Чат ${conversationId}: добавлено участников ${missing.length}`);
    }

    if (left.length > 0) {
      // Вышедший из группы теряет доступ к чату группы: доступ определяется
      // составом, и запись участника без этого осталась бы действительной.
      await this.chat.removeMembers(conversationId, left, new Date());
      this.logger.log(`Чат ${conversationId}: закрыт доступ ${left.length} участникам`);
    }
  }

  private async writeMembers(
    conversationId: string,
    participants: { userId: string; role: ConversationMemberRole }[],
  ): Promise<void> {
    await this.chat.addMembers(
      conversationId,
      participants.map((participant) => ({
        userId: participant.userId,
        role: participant.role,
      })),
    );
  }

  /**
   * Группы пользователя: где он тренер или представитель спортсмена.
   *
   * Список нужен, чтобы найти чаты, в которые пользователь входит по составу
   * группы. Права на просмотр групп здесь не проверяются: это внутренний
   * пересчет состава чата, а не выдача структуры клуба.
   */
  private async groupsOfUser(callerUserId: string): Promise<string[]> {
    const permissions = await this.identity.getPermissions(callerUserId);
    const isStaff =
      permissions.codes.includes(PermissionCode.ChatUse) ||
      permissions.codes.includes(PermissionCode.GroupsView);

    if (!isStaff) {
      // У MEMBER прав на группы нет: его группы определяются связями со
      // спортсменами. Ходить за группами по правам ему бессмысленно.
      return this.chat.groupsForLinkedAthletes(callerUserId);
    }

    const [coached, linked] = await Promise.all([
      this.chat.groupsForTrainer(callerUserId),
      this.chat.groupsForLinkedAthletes(callerUserId),
    ]);

    return [...new Set([...coached, ...linked])];
  }

  // --- Представления -------------------------------------------------------

  private async toView(
    conversation: ConversationRecord,
    callerUserId: string,
  ): Promise<ConversationView> {
    const [members, lastMessage] = await Promise.all([
      this.chat.listMembers(conversation.id),
      this.chat.lastMessage(conversation.id),
    ]);

    const lastReadAt = await this.chat.lastReadAt(conversation.id, callerUserId);
    const unreadCount = await this.chat.countUnread(conversation.id, callerUserId, lastReadAt);

    return {
      id: conversation.id,
      type: conversation.type as ConversationType,
      title: this.titleFor(conversation, members, callerUserId),
      groupId: conversation.groupId,
      participants: members.map(toMemberView),
      lastMessage: lastMessage ? toMessageView(lastMessage, callerUserId) : null,
      unreadCount,
      lastMessageAt: lastMessage?.createdAt.toISOString() ?? null,
      createdAt: conversation.createdAt.toISOString(),
    };
  }

  /**
   * Название диалога для интерфейса.
   *
   * У группового чата это имя группы, у личного — имя собеседника. Хранить
   * название личного диалога нельзя: у него нет осмысленного имени, кроме
   * второго участника, а он у каждого свой.
   */
  private titleFor(
    conversation: ConversationRecord,
    members: MemberRecord[],
    callerUserId: string,
  ): string {
    if (conversation.type === ConversationType.GROUP) {
      return conversation.groupName ?? conversation.title ?? 'Чат группы';
    }

    const other = members.find((member) => member.userId !== callerUserId);
    if (!other) {
      // Диалог с самим собой невозможен: личный диалог создается с собеседником.
      return 'Личный диалог';
    }

    return `${other.lastName} ${other.firstName}`;
  }
}

function toMemberView(member: MemberRecord): ConversationMemberView {
  return {
    userId: member.userId,
    firstName: member.firstName,
    lastName: member.lastName,
    role: member.role as ConversationMemberRole,
  };
}

function toMessageView(message: MessageRecord, callerUserId: string): MessageView {
  const isDeleted = message.deletedAt !== null;

  return {
    id: message.id,
    conversationId: message.conversationId,
    sender: {
      userId: message.senderId,
      firstName: message.senderFirstName,
      lastName: message.senderLastName,
      role: message.senderRole as ConversationMemberRole,
    },
    // Текст удаленного не отдается: иначе удаление было бы только визуальным.
    body: isDeleted ? '' : message.body,
    isDeleted,
    canDelete: !isDeleted && message.senderId === callerUserId,
    createdAt: message.createdAt.toISOString(),
  };
}
