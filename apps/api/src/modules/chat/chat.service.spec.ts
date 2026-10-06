import { AuditService } from '../audit/audit.service';
import { IdentityService } from '../identity/identity.service';
import type {
  ChatRepository,
  ConversationRecord,
  MemberRecord,
  MessageRecord,
} from './chat.repository';
import { ChatService } from './chat.service';

const groupConversation: ConversationRecord = {
  id: 'conv-group',
  type: 'GROUP',
  title: 'Старшая группа',
  groupId: 'group-1',
  groupName: 'Старшая группа',
  createdAt: new Date('2026-10-01T09:00:00.000Z'),
};

const directConversation: ConversationRecord = {
  id: 'conv-direct',
  type: 'DIRECT',
  title: null,
  groupId: null,
  groupName: null,
  createdAt: new Date('2026-10-02T09:00:00.000Z'),
};

const trainerMember: MemberRecord = {
  userId: 'trainer-1',
  firstName: 'Иван',
  lastName: 'Тренеров',
  role: 'TRAINER',
  lastReadAt: null,
};

const parentMember: MemberRecord = {
  userId: 'parent-1',
  firstName: 'Мария',
  lastName: 'Родитель',
  role: 'MEMBER',
  lastReadAt: null,
};

const message: MessageRecord = {
  id: 'msg-1',
  conversationId: 'conv-group',
  senderId: 'trainer-1',
  senderFirstName: 'Иван',
  senderLastName: 'Тренеров',
  senderRole: 'TRAINER',
  body: 'Занятие переносится',
  deletedAt: null,
  createdAt: new Date('2026-10-03T10:00:00.000Z'),
};

/** Пользователь без прав: так выглядит MEMBER (ADR-0006). */
const NO_PERMISSIONS: string[] = [];
/** STAFF: право на функцию `chat.use` есть, доступа к чужой переписке нет. */
const CHAT_USE = ['chat.use'];

describe('ChatService', () => {
  let chat: jest.Mocked<ChatRepository>;
  let identity: { getPermissions: jest.Mock; listUsers: jest.Mock };
  let audit: { recordSafely: jest.Mock };
  let service: ChatService;

  const permissionsFor = (map: Record<string, string[]>) => {
    identity.getPermissions.mockImplementation((userId: string) =>
      Promise.resolve({ codes: map[userId] ?? NO_PERMISSIONS }),
    );
  };

  beforeEach(() => {
    chat = {
      listConversationsForUser: jest.fn().mockResolvedValue([groupConversation]),
      findConversation: jest.fn().mockResolvedValue(groupConversation),
      findGroupConversation: jest.fn().mockResolvedValue(groupConversation),
      createConversation: jest.fn().mockResolvedValue(groupConversation),
      findDirectConversation: jest.fn().mockResolvedValue(null),
      listMembers: jest.fn().mockResolvedValue([trainerMember, parentMember]),
      isMember: jest.fn().mockResolvedValue(true),
      addMembers: jest.fn().mockResolvedValue(2),
      removeMembers: jest.fn().mockResolvedValue(0),
      markRead: jest.fn().mockResolvedValue(undefined),
      lastReadAt: jest.fn().mockResolvedValue(null),
      groupParticipants: jest.fn().mockResolvedValue([
        { userId: 'trainer-1', firstName: 'Иван', lastName: 'Тренеров', role: 'TRAINER' },
        { userId: 'parent-1', firstName: 'Мария', lastName: 'Родитель', role: 'MEMBER' },
      ]),
      findGroup: jest.fn().mockResolvedValue({ id: 'group-1', name: 'Старшая группа' }),
      groupsForTrainer: jest.fn().mockResolvedValue(['group-1']),
      groupsForLinkedAthletes: jest.fn().mockResolvedValue([]),
      listMessages: jest.fn().mockResolvedValue([message]),
      findMessage: jest.fn().mockResolvedValue(message),
      lastMessage: jest.fn().mockResolvedValue(message),
      countUnread: jest.fn().mockResolvedValue(0),
      createMessage: jest.fn().mockResolvedValue(message),
      softDeleteMessage: jest.fn().mockResolvedValue({ ...message, deletedAt: new Date() }),
    } as unknown as jest.Mocked<ChatRepository>;

    identity = {
      getPermissions: jest.fn().mockResolvedValue({ codes: CHAT_USE }),
      listUsers: jest.fn(),
    };
    audit = { recordSafely: jest.fn().mockResolvedValue(null) };

    service = new ChatService(
      chat,
      identity as unknown as IdentityService,
      audit as unknown as AuditService,
    );
  });

  describe('список диалогов', () => {
    it('добавляет чаты групп, где пользователь состоит (ADR-0012)', async () => {
      permissionsFor({ 'trainer-1': CHAT_USE });
      chat.findGroupConversation.mockResolvedValue(null);

      await service.list('trainer-1');

      // Чат создается при первом обращении, а не при создании группы.
      expect(chat.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GROUP', groupId: 'group-1' }),
      );
    });

    it('дописывает новых участников в существующий чат группы', async () => {
      permissionsFor({ 'trainer-1': CHAT_USE });
      chat.listMembers.mockResolvedValue([trainerMember]);
      chat.groupParticipants.mockResolvedValue([
        { userId: 'trainer-1', firstName: 'Иван', lastName: 'Тренеров', role: 'TRAINER' },
        { userId: 'parent-2', firstName: 'Петр', lastName: 'Новый', role: 'MEMBER' },
      ]);

      await service.list('trainer-1');

      expect(chat.addMembers).toHaveBeenCalledWith('conv-group', [
        { userId: 'parent-2', role: 'MEMBER' },
      ]);
    });

    it('для MEMBER группы ищутся по связанным спортсменам', async () => {
      permissionsFor({ 'parent-1': NO_PERMISSIONS });
      chat.groupsForLinkedAthletes.mockResolvedValue(['group-1']);
      chat.findGroupConversation.mockResolvedValue(null);

      await service.list('parent-1');

      expect(chat.groupsForTrainer).not.toHaveBeenCalled();
      expect(chat.groupsForLinkedAthletes).toHaveBeenCalledWith('parent-1');
    });

    it('название личного диалога — имя собеседника', async () => {
      permissionsFor({ 'parent-1': CHAT_USE });
      chat.listConversationsForUser.mockResolvedValue([directConversation]);

      const [conversation] = await service.list('parent-1');

      expect(conversation?.title).toBe('Тренеров Иван');
      expect(conversation?.type).toBe('DIRECT');
    });

    it('сортирует диалоги по последнему сообщению', async () => {
      permissionsFor({ 'parent-1': CHAT_USE });
      chat.listConversationsForUser.mockResolvedValue([groupConversation, directConversation]);
      chat.lastMessage.mockImplementation((conversationId: string) =>
        Promise.resolve(
          conversationId === 'conv-direct'
            ? { ...message, conversationId, createdAt: new Date('2026-10-05T10:00:00.000Z') }
            : message,
        ),
      );

      const list = await service.list('parent-1');

      expect(list.map((item) => item.id)).toEqual(['conv-direct', 'conv-group']);
    });

    it('показывает число непрочитанных', async () => {
      permissionsFor({ 'parent-1': CHAT_USE });
      chat.lastReadAt.mockResolvedValue(new Date('2026-10-01T00:00:00.000Z'));
      chat.countUnread.mockResolvedValue(3);

      const [conversation] = await service.list('parent-1');

      expect(conversation?.unreadCount).toBe(3);
      expect(chat.countUnread).toHaveBeenCalledWith(
        'conv-group',
        'parent-1',
        new Date('2026-10-01T00:00:00.000Z'),
      );
    });
  });

  describe('история диалога', () => {
    it('сдвигает отметку о прочитанном при чтении', async () => {
      await service.get('parent-1', 'conv-group');

      expect(chat.markRead).toHaveBeenCalledWith('conv-group', 'parent-1', expect.any(Date));
    });

    it('в ответе непрочитанных нет: они только что прочитаны', async () => {
      chat.countUnread.mockResolvedValue(5);

      const details = await service.get('parent-1', 'conv-group');

      expect(details.unreadCount).toBe(0);
    });

    it('курсор отдается только на заполненной странице', async () => {
      const details = await service.get('parent-1', 'conv-group');

      // Одно сообщение из 50: история исчерпана, лишний запрос не нужен.
      expect(details.olderCursor).toBeNull();
    });

    it('отдает курсор, если страница заполнена целиком', async () => {
      const fullPage = Array.from({ length: 50 }, (_, index) => ({
        ...message,
        id: `msg-${index}`,
        createdAt: new Date(2026, 9, 1, 10, index),
      }));
      chat.listMessages.mockResolvedValue(fullPage);

      const details = await service.get('parent-1', 'conv-group');

      expect(details.olderCursor).toBe(fullPage[0]?.createdAt.toISOString());
    });

    it('недоступный диалог отдает 404, а не 403', async () => {
      chat.isMember.mockResolvedValue(false);

      // По коду ответа нельзя выяснить, существует ли чужая переписка.
      await expect(service.get('stranger-1', 'conv-group')).rejects.toMatchObject({
        code: 'CONVERSATION_NOT_FOUND',
      });
    });

    it('вышедший из группы теряет доступ, даже если запись участника осталась', async () => {
      // Запись в ConversationMember есть, но в составе группы пользователя нет:
      // доступ определяется составом (ADR-0012).
      chat.isMember.mockResolvedValue(true);
      chat.groupParticipants.mockResolvedValue([trainerMember]);

      await expect(service.get('parent-1', 'conv-group')).rejects.toMatchObject({
        code: 'CONVERSATION_NOT_FOUND',
      });
    });

    it('вышедший из группы помечается leftAt, а не удаляется', async () => {
      // Родитель открывает конкретный чат: синхронизация идет по группе самого
      // чата, а не по списку групп пользователя — вышедший в нем уже не значится.
      chat.groupParticipants.mockResolvedValue([trainerMember]);

      await expect(service.get('parent-1', 'conv-group')).rejects.toMatchObject({
        code: 'CONVERSATION_NOT_FOUND',
      });

      // Строка участника сохраняется: иначе вернувшийся увидит прочитанное как
      // новое, а история «до какого момента читал» потеряется.
      expect(chat.removeMembers).toHaveBeenCalledWith('conv-group', ['parent-1'], expect.any(Date));
    });

    it('несуществующий диалог отдает 404', async () => {
      chat.findConversation.mockResolvedValue(null);

      await expect(service.get('parent-1', 'unknown')).rejects.toMatchObject({
        code: 'CONVERSATION_NOT_FOUND',
      });
    });

    it('некорректный курсор отклоняется', async () => {
      await expect(service.get('parent-1', 'conv-group', 'не-дата')).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    });
  });

  describe('создание диалога', () => {
    it('групповой чат доступен тренеру группы', async () => {
      await service.create('trainer-1', { groupId: 'group-1' });

      expect(chat.findGroupConversation).toHaveBeenCalledWith('group-1');
    });

    it('посторонний не может открыть чат группы', async () => {
      chat.groupParticipants.mockResolvedValue([trainerMember]);

      await expect(service.create('stranger-1', { groupId: 'group-1' })).rejects.toMatchObject({
        code: 'CONVERSATION_ACCESS_DENIED',
      });
      expect(chat.createConversation).not.toHaveBeenCalled();
    });

    it('создает чат группы, если его еще нет', async () => {
      chat.findGroupConversation.mockResolvedValue(null);

      await service.create('trainer-1', { groupId: 'group-1' });

      expect(chat.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GROUP', title: 'Старшая группа', groupId: 'group-1' }),
      );
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'chat.conversation_created' }),
      );
    });

    it('личный диалог создается ровно с одним собеседником', async () => {
      await expect(
        service.create('parent-1', { participantIds: ['trainer-1', 'trainer-2'] }),
      ).rejects.toMatchObject({ code: 'CONVERSATION_PARTICIPANTS_INVALID' });
    });

    it('повторный личный диалог возвращает существующий', async () => {
      chat.findDirectConversation.mockResolvedValue(directConversation);

      await service.create('parent-1', { participantIds: ['trainer-1'] });

      // Иначе у пары копились бы параллельные переписки с тем же составом.
      expect(chat.createConversation).not.toHaveBeenCalled();
    });

    it('диалог с самим собой не создается', async () => {
      await expect(
        service.create('parent-1', { participantIds: ['parent-1'] }),
      ).rejects.toMatchObject({ code: 'CONVERSATION_PARTICIPANTS_INVALID' });
    });

    it('нельзя одновременно указать группу и собеседника', async () => {
      await expect(
        service.create('trainer-1', { groupId: 'group-1', participantIds: ['parent-1'] }),
      ).rejects.toMatchObject({ code: 'CONVERSATION_TYPE_INVALID' });
    });

    it('создание личного диалога пишет аудит', async () => {
      await service.create('parent-1', { participantIds: ['trainer-1'] });

      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'chat.conversation_created',
          after: expect.objectContaining({ type: 'DIRECT' }),
        }),
      );
    });
  });

  describe('сообщения', () => {
    it('участник отправляет сообщение', async () => {
      await service.sendMessage('trainer-1', 'conv-group', { body: 'Текст' });

      expect(chat.createMessage).toHaveBeenCalledWith({
        conversationId: 'conv-group',
        senderId: 'trainer-1',
        body: 'Текст',
      });
    });

    it('неучастник не может отправить сообщение', async () => {
      chat.isMember.mockResolvedValue(false);

      await expect(
        service.sendMessage('stranger-1', 'conv-group', { body: 'Текст' }),
      ).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
      expect(chat.createMessage).not.toHaveBeenCalled();
    });

    it('пустое сообщение отклоняется', async () => {
      await expect(
        service.sendMessage('trainer-1', 'conv-group', { body: '   ' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('отправитель удаляет свое сообщение', async () => {
      await service.deleteMessage('trainer-1', 'msg-1');

      expect(chat.softDeleteMessage).toHaveBeenCalledWith('msg-1', expect.any(Date));
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'chat.message_deleted' }),
      );
    });

    it('чужое сообщение удалить нельзя', async () => {
      await expect(service.deleteMessage('parent-1', 'msg-1')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(chat.softDeleteMessage).not.toHaveBeenCalled();
    });

    it('неучастник не может удалить даже свое сообщение в чужом диалоге', async () => {
      chat.isMember.mockResolvedValue(false);

      // Сначала проверяется доступ: иначе разница ответов выдала бы
      // существование переписки.
      await expect(service.deleteMessage('trainer-1', 'msg-1')).rejects.toMatchObject({
        code: 'CONVERSATION_NOT_FOUND',
      });
    });

    it('повторное удаление отклоняется', async () => {
      chat.findMessage.mockResolvedValue({ ...message, deletedAt: new Date() });

      await expect(service.deleteMessage('trainer-1', 'msg-1')).rejects.toMatchObject({
        code: 'MESSAGE_NOT_FOUND',
      });
    });

    it('текст удаленного сообщения не отдается', async () => {
      chat.listMessages.mockResolvedValue([{ ...message, deletedAt: new Date() }]);

      const details = await service.get('trainer-1', 'conv-group');

      expect(details.messages[0]?.isDeleted).toBe(true);
      expect(details.messages[0]?.body).toBe('');
    });

    it('признак удаления зависит от отправителя', async () => {
      const details = await service.get('parent-1', 'conv-group');

      // Сообщение отправил тренер, значит родитель удалить его не может.
      expect(details.messages[0]?.canDelete).toBe(false);
    });

    it('свои сообщения всегда можно удалить', async () => {
      const details = await service.get('trainer-1', 'conv-group');

      expect(details.messages[0]?.canDelete).toBe(true);
    });

    it('роль отправителя берется из участника диалога', async () => {
      const details = await service.get('parent-1', 'conv-group');

      expect(details.messages[0]?.sender.role).toBe('TRAINER');
    });
  });
});
