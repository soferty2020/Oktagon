import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/core/api_exception.dart';
import 'package:octagon_mobile/features/chat/chat_controller.dart';
import 'package:octagon_mobile/features/chat/chat_repository.dart';
import 'package:octagon_mobile/features/chat/chats_controller.dart';

import 'support/fake_api_client.dart';

const String currentUserId = 'user-1';

Map<String, dynamic> participant(String id, String firstName, String role) {
  return {'userId': id, 'firstName': firstName, 'lastName': 'Демо', 'role': role};
}

Map<String, dynamic> message({
  required String id,
  required String senderId,
  required String body,
  String createdAt = '2026-10-21T10:00:00.000Z',
  bool isDeleted = false,
}) {
  return {
    'id': id,
    'conversationId': 'conversation-1',
    'sender': participant(senderId, senderId == currentUserId ? 'Алия' : 'Иван', 'PARENT'),
    'body': body,
    'isDeleted': isDeleted,
    'canDelete': senderId == currentUserId,
    'createdAt': createdAt,
  };
}

Map<String, dynamic> conversation({
  required String id,
  required String type,
  required String title,
  int unread = 0,
  Map<String, dynamic>? last,
}) {
  return {
    'id': id,
    'type': type,
    'title': title,
    'groupId': type == 'GROUP' ? 'group-1' : null,
    'participants': [
      participant(currentUserId, 'Алия', 'PARENT'),
      participant('user-2', 'Иван', 'TRAINER'),
    ],
    'lastMessage': last,
    'unreadCount': unread,
    'lastMessageAt': last == null ? null : last['createdAt'],
    'createdAt': '2026-10-01T10:00:00.000Z',
  };
}

void main() {
  group('список диалогов', () {
    test('суммирует непрочитанные', () async {
      final client = FakeApiClient();
      client.responses['GET /conversations'] = {
        'data': [
          conversation(
            id: 'conversation-1',
            type: 'GROUP',
            title: 'Дети 7-9',
            unread: 2,
            last: message(id: 'm1', senderId: 'user-2', body: 'Здравствуйте'),
          ),
          conversation(id: 'conversation-2', type: 'PRIVATE', title: 'Иван Демо', unread: 1),
        ],
      };

      final controller = ChatsController(repository: ChatRepository(client: client));
      await controller.load(token: 'token', currentUserId: currentUserId);

      expect(controller.conversations, hasLength(2));
      expect(controller.unreadTotal, 3);
      expect(controller.isEmpty, isFalse);
    });

    test('ошибка сети показывается понятным текстом', () async {
      final client = FakeApiClient();
      client.errors['GET /conversations'] = const ApiException(
        code: 'NETWORK',
        message: 'Нет связи',
      );

      final controller = ChatsController(repository: ChatRepository(client: client));
      await controller.load(token: 'token', currentUserId: currentUserId);

      expect(controller.error, contains('Нет связи'));
      expect(controller.conversations, isEmpty);
    });
  });

  group('переписка', () {
    test('определяет свои и чужие сообщения', () async {
      final client = FakeApiClient();
      client.responses['GET /conversations/conversation-1'] = {
        ...conversation(id: 'conversation-1', type: 'GROUP', title: 'Дети 7-9'),
        'messages': [
          message(id: 'm1', senderId: 'user-2', body: 'Здравствуйте'),
          message(id: 'm2', senderId: currentUserId, body: 'Добрый день'),
        ],
        'olderCursor': null,
      };

      final controller = ChatController(repository: ChatRepository(client: client));
      await controller.load(
        token: 'token',
        conversationId: 'conversation-1',
        currentUserId: currentUserId,
      );

      expect(controller.messages, hasLength(2));
      expect(controller.messages.first.isMine, isFalse);
      expect(controller.messages.last.isMine, isTrue);
      expect(controller.details?.conversation.isGroup, isTrue);
    });

    test('удаленное сообщение не показывает текст', () async {
      final client = FakeApiClient();
      client.responses['GET /conversations/conversation-1'] = {
        ...conversation(id: 'conversation-1', type: 'PRIVATE', title: 'Иван'),
        'messages': [
          message(id: 'm1', senderId: 'user-2', body: '', isDeleted: true),
        ],
        'olderCursor': null,
      };

      final controller = ChatController(repository: ChatRepository(client: client));
      await controller.load(
        token: 'token',
        conversationId: 'conversation-1',
        currentUserId: currentUserId,
      );

      expect(controller.messages.single.isDeleted, isTrue);
      expect(controller.messages.single.body, isEmpty);
    });
  });

  group('отправка сообщения', () {
    test('пустое сообщение не отправляется', () async {
      final client = FakeApiClient();
      final controller = ChatController(repository: ChatRepository(client: client));

      final sent = await controller.send(
        token: 'token',
        conversationId: 'conversation-1',
        currentUserId: currentUserId,
        body: '   ',
      );

      expect(sent, isFalse);
      expect(client.calls, isEmpty);
    });

    test('после отправки история перезагружается', () async {
      final client = FakeApiClient();
      client.responses['POST /conversations/conversation-1/messages'] = message(
        id: 'm2',
        senderId: currentUserId,
        body: 'Добрый день',
      );
      client.responses['GET /conversations/conversation-1'] = {
        ...conversation(id: 'conversation-1', type: 'PRIVATE', title: 'Иван'),
        'messages': [message(id: 'm2', senderId: currentUserId, body: 'Добрый день')],
        'olderCursor': null,
      };

      final controller = ChatController(repository: ChatRepository(client: client));
      final sent = await controller.send(
        token: 'token',
        conversationId: 'conversation-1',
        currentUserId: currentUserId,
        body: 'Добрый день',
      );

      expect(sent, isTrue);
      expect(client.calls, contains('POST /conversations/conversation-1/messages'));
      expect(client.calls, contains('GET /conversations/conversation-1'));
      expect(controller.messages.single.body, 'Добрый день');
    });

    test('ошибка отправки оставляет текст в поле', () async {
      // Контроллер возвращает false, и экран возвращает текст в поле ввода:
      // набирать сообщение заново после сбоя сети недопустимо.
      final client = FakeApiClient();
      client.errors['POST /conversations/conversation-1/messages'] = const ApiException(
        code: 'NETWORK',
        message: 'Нет связи',
      );

      final controller = ChatController(repository: ChatRepository(client: client));
      final sent = await controller.send(
        token: 'token',
        conversationId: 'conversation-1',
        currentUserId: currentUserId,
        body: 'Важное сообщение',
      );

      expect(sent, isFalse);
      expect(controller.error, contains('Нет связи'));
    });
  });
}
