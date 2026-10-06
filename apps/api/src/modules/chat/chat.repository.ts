import { Injectable } from '@nestjs/common';
import { ConversationMemberRole, ConversationType } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

export interface ConversationRecord {
  id: string;
  type: ConversationType;
  title: string | null;
  groupId: string | null;
  groupName: string | null;
  createdAt: Date;
}

export interface MemberRecord {
  userId: string;
  firstName: string;
  lastName: string;
  role: ConversationMemberRole;
  lastReadAt: Date | null;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  senderFirstName: string;
  senderLastName: string;
  senderRole: ConversationMemberRole;
  body: string;
  deletedAt: Date | null;
  createdAt: Date;
}

/** Кандидат в участники группового чата: вычисляется по группе (ADR-0012). */
export interface GroupParticipantRecord {
  userId: string;
  firstName: string;
  lastName: string;
  role: ConversationMemberRole;
}

/**
 * Доступ к диалогам, участникам и сообщениям (BR-012, ADR-0011, ADR-0012).
 *
 * Абстрактный класс как DI-токен: сервис не зависит от Prisma и тестируется без
 * БД (docs/13-architecture.md).
 */
export abstract class ChatRepository {
  abstract listConversationsForUser(userId: string): Promise<ConversationRecord[]>;
  abstract findConversation(id: string): Promise<ConversationRecord | null>;
  abstract findGroupConversation(groupId: string): Promise<ConversationRecord | null>;
  abstract createConversation(input: {
    type: ConversationType;
    title: string | null;
    groupId: string | null;
  }): Promise<ConversationRecord>;
  /** Личный диалог ровно с этими участниками, если он уже есть (ADR-0012). */
  abstract findDirectConversation(userIds: string[]): Promise<ConversationRecord | null>;

  abstract listMembers(conversationId: string): Promise<MemberRecord[]>;
  abstract isMember(conversationId: string, userId: string): Promise<boolean>;
  abstract addMembers(
    conversationId: string,
    members: { userId: string; role: ConversationMemberRole }[],
  ): Promise<number>;
  /**
   * Помечает участников вышедшими из диалога.
   *
   * `leftAt`, а не удаление строки: у участника остается `lastReadAt`, и при
   * возвращении в группу он не увидит прочитанное как новое (ADR-0012).
   */
  abstract removeMembers(conversationId: string, userIds: string[], leftAt: Date): Promise<number>;
  abstract markRead(conversationId: string, userId: string, at: Date): Promise<void>;
  /** Возвращает `lastReadAt` участника: нужен для подсчета непрочитанных. */
  abstract lastReadAt(conversationId: string, userId: string): Promise<Date | null>;

  /** Состав группового чата, вычисленный по группе (ADR-0012). */
  abstract groupParticipants(groupId: string): Promise<GroupParticipantRecord[]>;
  abstract findGroup(groupId: string): Promise<{ id: string; name: string } | null>;
  /** Группы, где пользователь — активный тренер. */
  abstract groupsForTrainer(userId: string): Promise<string[]>;
  /** Группы с активным членством спортсменов, связанных с пользователем. */
  abstract groupsForLinkedAthletes(userId: string): Promise<string[]>;

  abstract listMessages(
    conversationId: string,
    options: { olderThan?: Date; limit: number },
  ): Promise<MessageRecord[]>;
  abstract findMessage(id: string): Promise<MessageRecord | null>;
  abstract lastMessage(conversationId: string): Promise<MessageRecord | null>;
  abstract countUnread(conversationId: string, userId: string, since: Date | null): Promise<number>;
  abstract createMessage(input: {
    conversationId: string;
    senderId: string;
    body: string;
  }): Promise<MessageRecord>;
  abstract softDeleteMessage(id: string, deletedAt: Date): Promise<MessageRecord>;
}

const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  senderId: true,
  body: true,
  deletedAt: true,
  createdAt: true,
  sender: {
    select: {
      firstName: true,
      lastName: true,
      conversationMember: {
        select: { role: true, conversationId: true },
      },
    },
  },
} as const;

const CONVERSATION_SELECT = {
  id: true,
  type: true,
  title: true,
  groupId: true,
  createdAt: true,
  group: { select: { name: true } },
} as const;

@Injectable()
export class PrismaChatRepository extends ChatRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listConversationsForUser(userId: string): Promise<ConversationRecord[]> {
    const conversations = await this.prisma.db.conversation.findMany({
      where: { members: { some: { userId, leftAt: null } } },
      orderBy: { updatedAt: 'desc' },
      select: CONVERSATION_SELECT,
    });

    return conversations.map(toConversationRecord);
  }

  async findConversation(id: string): Promise<ConversationRecord | null> {
    const conversation = await this.prisma.db.conversation.findUnique({
      where: { id },
      select: CONVERSATION_SELECT,
    });

    return conversation ? toConversationRecord(conversation) : null;
  }

  async findGroupConversation(groupId: string): Promise<ConversationRecord | null> {
    const conversation = await this.prisma.db.conversation.findFirst({
      where: { groupId, type: ConversationType.GROUP },
      select: CONVERSATION_SELECT,
    });

    return conversation ? toConversationRecord(conversation) : null;
  }

  async createConversation(input: {
    type: ConversationType;
    title: string | null;
    groupId: string | null;
  }): Promise<ConversationRecord> {
    const conversation = await this.prisma.db.conversation.create({
      data: { type: input.type, title: input.title, groupId: input.groupId },
      select: CONVERSATION_SELECT,
    });

    return toConversationRecord(conversation);
  }

  async findDirectConversation(userIds: string[]): Promise<ConversationRecord | null> {
    // Диалог найден, если он личный и в нем ровно те же участники: иначе
    // достаточно было бы совпадения по одному человеку.
    const conversation = await this.prisma.db.conversation.findFirst({
      where: {
        type: ConversationType.DIRECT,
        AND: userIds.map((userId) => ({ members: { some: { userId, leftAt: null } } })),
        members: { every: { userId: { in: userIds } } },
      },
      select: CONVERSATION_SELECT,
    });

    if (!conversation) {
      return null;
    }

    const members = await this.listMembers(conversation.id);
    const active = members.filter((member) => userIds.includes(member.userId));
    if (active.length !== userIds.length) {
      return null;
    }

    return toConversationRecord(conversation);
  }

  async listMembers(conversationId: string): Promise<MemberRecord[]> {
    const members = await this.prisma.db.conversationMember.findMany({
      where: { conversationId, leftAt: null },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      select: {
        userId: true,
        role: true,
        lastReadAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });

    return members.map((member) => ({
      userId: member.userId,
      firstName: member.user.firstName,
      lastName: member.user.lastName,
      role: member.role,
      lastReadAt: member.lastReadAt,
    }));
  }

  async isMember(conversationId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.db.conversationMember.findFirst({
      where: { conversationId, userId, leftAt: null },
      select: { id: true },
    });

    return member !== null;
  }

  async addMembers(
    conversationId: string,
    members: { userId: string; role: ConversationMemberRole }[],
  ): Promise<number> {
    if (members.length === 0) {
      return 0;
    }

    // upsert, а не createMany: участник мог быть добавлен ранее и уже иметь
    // lastReadAt. Повторное добавление не должно сбрасывать прочитанное.
    const results = await this.prisma.db.$transaction(
      members.map((member) =>
        this.prisma.db.conversationMember.upsert({
          where: { conversationId_userId: { conversationId, userId: member.userId } },
          create: { conversationId, userId: member.userId, role: member.role },
          update: { leftAt: null, role: member.role },
          select: { id: true },
        }),
      ),
    );

    return results.length;
  }

  async markRead(conversationId: string, userId: string, at: Date): Promise<void> {
    await this.prisma.db.conversationMember.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: at },
    });
  }

  async removeMembers(conversationId: string, userIds: string[], leftAt: Date): Promise<number> {
    if (userIds.length === 0) {
      return 0;
    }

    const result = await this.prisma.db.conversationMember.updateMany({
      where: { conversationId, userId: { in: userIds }, leftAt: null },
      data: { leftAt },
    });

    return result.count;
  }

  async lastReadAt(conversationId: string, userId: string): Promise<Date | null> {
    const member = await this.prisma.db.conversationMember.findFirst({
      where: { conversationId, userId },
      select: { lastReadAt: true },
    });

    return member?.lastReadAt ?? null;
  }

  /**
   * Состав группового чата: тренеры группы и представители ее спортсменов.
   *
   * Тренер без аккаунта не попадает в чат: у него нет входа в систему
   * (docs/04-roles-permissions.md). Спортсмен учитывается только с активным
   * членством: иначе чат остался бы доступен после ухода из группы (ADR-0012).
   */
  async groupParticipants(groupId: string): Promise<GroupParticipantRecord[]> {
    const [trainers, athletes] = await Promise.all([
      this.prisma.db.groupTrainer.findMany({
        where: {
          groupId,
          unassignedAt: null,
          trainerProfile: { userId: { not: null }, isActive: true, archivedAt: null },
        },
        select: {
          trainerProfile: {
            select: { userId: true, user: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.db.groupMembership.findMany({
        where: { groupId, state: 'ACTIVE' },
        select: {
          athlete: {
            select: {
              userLinks: {
                select: {
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      status: true,
                      archivedAt: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const result = new Map<string, GroupParticipantRecord>();

    for (const entry of trainers) {
      const user = entry.trainerProfile.user;
      const userId = entry.trainerProfile.userId;
      if (!userId || !user) {
        continue;
      }
      result.set(userId, {
        userId,
        firstName: user.firstName,
        lastName: user.lastName,
        role: ConversationMemberRole.TRAINER,
      });
    }

    for (const entry of athletes) {
      for (const link of entry.athlete.userLinks) {
        // Заблокированный или архивный аккаунт в чат не добавляется: он не может
        // войти, а его участие раскрывало бы переписку постороннему.
        if (link.user.status !== 'ACTIVE' || link.user.archivedAt) {
          continue;
        }
        // Роль тренера приоритетнее: если аккаунт и тренер, и родитель, в чате он
        // представлен как тренер.
        if (result.get(link.user.id)?.role === ConversationMemberRole.TRAINER) {
          continue;
        }
        result.set(link.user.id, {
          userId: link.user.id,
          firstName: link.user.firstName,
          lastName: link.user.lastName,
          role: ConversationMemberRole.MEMBER,
        });
      }
    }

    return [...result.values()];
  }

  async findGroup(groupId: string): Promise<{ id: string; name: string } | null> {
    const group = await this.prisma.db.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true },
    });

    return group;
  }

  async groupsForTrainer(userId: string): Promise<string[]> {
    const rows = await this.prisma.db.groupTrainer.findMany({
      where: {
        unassignedAt: null,
        trainerProfile: { userId, isActive: true, archivedAt: null },
        group: { archivedAt: null },
      },
      select: { groupId: true },
    });

    return [...new Set(rows.map((row) => row.groupId))];
  }

  async groupsForLinkedAthletes(userId: string): Promise<string[]> {
    const rows = await this.prisma.db.groupMembership.findMany({
      where: {
        state: 'ACTIVE',
        group: { archivedAt: null },
        athlete: { userLinks: { some: { userId } } },
      },
      select: { groupId: true },
    });

    return [...new Set(rows.map((row) => row.groupId))];
  }

  async listMessages(
    conversationId: string,
    options: { olderThan?: Date; limit: number },
  ): Promise<MessageRecord[]> {
    const messages = await this.prisma.db.message.findMany({
      where: {
        conversationId,
        ...(options.olderThan ? { createdAt: { lt: options.olderThan } } : {}),
      },
      // Берем последние сообщения, затем разворачиваем: клиенту нужен хвост
      // переписки, а не начало.
      orderBy: { createdAt: 'desc' },
      take: options.limit,
      select: MESSAGE_SELECT,
    });

    return messages.reverse().map((message) => toMessageRecord(message, conversationId));
  }

  async findMessage(id: string): Promise<MessageRecord | null> {
    const message = await this.prisma.db.message.findUnique({
      where: { id },
      select: MESSAGE_SELECT,
    });

    return message ? toMessageRecord(message, message.conversationId) : null;
  }

  async lastMessage(conversationId: string): Promise<MessageRecord | null> {
    const message = await this.prisma.db.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      select: MESSAGE_SELECT,
    });

    return message ? toMessageRecord(message, conversationId) : null;
  }

  async countUnread(conversationId: string, userId: string, since: Date | null): Promise<number> {
    return this.prisma.db.message.count({
      where: {
        conversationId,
        senderId: { not: userId },
        ...(since ? { createdAt: { gt: since } } : {}),
      },
    });
  }

  async createMessage(input: {
    conversationId: string;
    senderId: string;
    body: string;
  }): Promise<MessageRecord> {
    const message = await this.prisma.db.message.create({
      data: {
        conversationId: input.conversationId,
        senderId: input.senderId,
        body: input.body,
      },
      select: MESSAGE_SELECT,
    });

    // Диалог поднимается в списке по времени последнего сообщения: порядок
    // списка задается `updatedAt`, а не отдельным полем с датой.
    await this.prisma.db.conversation.update({
      where: { id: input.conversationId },
      data: { updatedAt: new Date() },
    });

    return toMessageRecord(message, input.conversationId);
  }

  async softDeleteMessage(id: string, deletedAt: Date): Promise<MessageRecord> {
    const message = await this.prisma.db.message.update({
      where: { id },
      data: { deletedAt },
      select: MESSAGE_SELECT,
    });

    return toMessageRecord(message, message.conversationId);
  }
}

function toConversationRecord(conversation: {
  id: string;
  type: ConversationType;
  title: string | null;
  groupId: string | null;
  createdAt: Date;
  group: { name: string } | null;
}): ConversationRecord {
  return {
    id: conversation.id,
    type: conversation.type,
    title: conversation.title,
    groupId: conversation.groupId,
    groupName: conversation.group?.name ?? null,
    createdAt: conversation.createdAt,
  };
}

/**
 * Преобразует сообщение в запись с ролью отправителя **в этом диалоге**.
 *
 * Роль берется из `ConversationMember` именно этого диалога: один и тот же
 * человек в одном чате тренер, а в другом — родитель.
 */
function toMessageRecord(
  message: {
    id: string;
    conversationId: string;
    senderId: string;
    body: string;
    deletedAt: Date | null;
    createdAt: Date;
    sender: {
      firstName: string;
      lastName: string;
      conversationMember: { role: ConversationMemberRole; conversationId: string }[];
    };
  },
  conversationId: string,
): MessageRecord {
  const membership = message.sender.conversationMember.find(
    (entry) => entry.conversationId === conversationId,
  );

  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderFirstName: message.sender.firstName,
    senderLastName: message.sender.lastName,
    senderRole: membership?.role ?? ConversationMemberRole.MEMBER,
    body: message.body,
    deletedAt: message.deletedAt,
    createdAt: message.createdAt,
  };
}
