import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/app_theme.dart';
import 'package:octagon_mobile/features/attendance/attendance_history_controller.dart';
import 'package:octagon_mobile/features/attendance/attendance_history_screen.dart';
import 'package:octagon_mobile/features/attendance/attendance_repository.dart';
import 'package:octagon_mobile/features/auth/auth_controller.dart';
import 'package:octagon_mobile/features/auth/auth_repository.dart';
import 'package:octagon_mobile/features/chat/chat_controller.dart';
import 'package:octagon_mobile/features/chat/chat_repository.dart';
import 'package:octagon_mobile/features/chat/chat_screen.dart';
import 'package:octagon_mobile/features/chat/chats_controller.dart';
import 'package:octagon_mobile/features/chat/chats_screen.dart';
import 'package:octagon_mobile/features/home/member_home_controller.dart';
import 'package:octagon_mobile/features/home/member_home_screen.dart';
import 'package:octagon_mobile/features/news/news_controller.dart';
import 'package:octagon_mobile/features/news/news_repository.dart';
import 'package:octagon_mobile/features/payments/payment_status_repository.dart';
import 'package:octagon_mobile/features/news/news_screen.dart';
import 'package:octagon_mobile/features/profile/profile_screen.dart';
import 'package:octagon_mobile/features/schedule/schedule_controller.dart';
import 'package:octagon_mobile/features/schedule/schedule_repository.dart';
import 'package:octagon_mobile/features/schedule/schedule_screen.dart';
import 'package:octagon_mobile/features/athletes/athlete_repository.dart';
import 'package:octagon_mobile/features/groups/group_repository.dart';

import 'support/fake_api_client.dart';
import 'support/in_memory_token_storage.dart';
import 'auth_repository_test.dart' show sessionResponse;

/// Скриншоты экранов для визуальной проверки дизайна.
///
/// Golden-тесты, а не скриншоты браузера: они рендерят те же виджеты тем же
/// движком, что и устройство, но не требуют запущенного API, эмулятора и
/// автоматизации браузера. Запуск с обновлением эталонов:
///   flutter test --update-goldens test/golden_screens_test.dart
///
/// Шрифт подгружается из системы: без него Flutter в тестах рисует текст
/// прямоугольниками (тестовый шрифт Ahem), и скриншот не показателен.
Future<void> loadSystemFont() async {
  final candidates = [
    'C:/Windows/Fonts/segoeui.ttf',
    'C:/Windows/Fonts/arial.ttf',
  ];

  for (final path in candidates) {
    final file = File(path);
    if (!file.existsSync()) {
      continue;
    }
    final bytes = file.readAsBytesSync();
    final loader = FontLoader('Roboto')
      ..addFont(Future.value(ByteData.view(Uint8List.fromList(bytes).buffer)));
    await loader.load();
    break;
  }

  // Шрифт иконок: без него вместо иконок рисуются прямоугольники, и скриншот
  // выглядит сломанным, хотя приложение в порядке.
  final iconFont = File(
    '../../.tools/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
  );
  if (iconFont.existsSync()) {
    final iconBytes = iconFont.readAsBytesSync();
    final iconLoader = FontLoader('MaterialIcons')
      ..addFont(Future.value(ByteData.view(Uint8List.fromList(iconBytes).buffer)));
    await iconLoader.load();
  }
}

DateTime get now => DateTime(2026, 10, 21, 12);

FakeApiClient buildClient() {
  final client = FakeApiClient();

  client.responses['GET /me'] = {
    'id': 'user-1',
    'email': 'aliya@octagon.local',
    'firstName': 'Алия',
    'lastName': 'Демо',
    'role': 'MEMBER',
    'status': 'ACTIVE',
    'scopeAllGroups': false,
    'permissions': ['groups.view', 'schedule.view', 'attendance.view'],
  };

  client.responses['GET /me/athletes/athlete-1/payment-status'] = {
    'year': 2026,
    'month': 10,
    'monthLabel': 'октябрь 2026',
    'status': 'PAID',
    'message': 'Оплата за октябрь 2026 внесена',
  };

  client.responses['GET /me/athletes'] = {
    'data': [
      {
        'id': 'athlete-1',
        'firstName': 'Дамир',
        'lastName': 'Демо',
        'middleName': null,
        'birthDate': '2015-04-12',
        'status': 'ACTIVE',
        'beltGrade': 'YELLOW',
        'beltAwardedAt': '2024-02-10',
        'relation': 'PARENT',
        'isPrimary': true,
      },
    ],
  };

  client.responses['GET /groups/by-athlete/athlete-1'] = {
    'id': 'group-1',
    'name': 'Дети 7-9 лет, новички',
  };

  client.responses['GET /training-sessions'] = {
    'data': [
      {
        'id': 'session-1',
        'groupId': 'group-1',
        'groupName': 'Дети 7-9 лет, новички',
        'branchId': null,
        'hallId': null,
        'hallName': 'Зал 1',
        'trainerId': null,
        'trainerName': 'Иванов И.И.',
        'startsAt': now.add(const Duration(hours: 6)).toUtc().toIso8601String(),
        'endsAt': now.add(const Duration(hours: 7, minutes: 30)).toUtc().toIso8601String(),
        'status': 'SCHEDULED',
        'changeReason': null,
        'cancelledAt': null,
        'fromTemplate': true,
      },
      {
        'id': 'session-2',
        'groupId': 'group-1',
        'groupName': 'Дети 7-9 лет, новички',
        'branchId': null,
        'hallId': null,
        'hallName': 'Зал 1',
        'trainerId': null,
        'trainerName': 'Иванов И.И.',
        'startsAt': now.add(const Duration(days: 2, hours: 6)).toUtc().toIso8601String(),
        'endsAt': now.add(const Duration(days: 2, hours: 7)).toUtc().toIso8601String(),
        'status': 'SCHEDULED',
        'changeReason': null,
        'cancelledAt': null,
        'fromTemplate': true,
      },
    ],
  };

  client.responses['GET /attendance/summary'] = {
    'data': [
      {
        'athleteId': 'athlete-1',
        'total': 8,
        'present': 7,
        'absent': 1,
        'excused': 0,
        'unmarked': 0,
      },
    ],
  };

  client.responses['GET /news'] = {
    'data': [
      {
        'id': 'news-1',
        'title': 'Открыт набор на летние сборы',
        'body': 'С 1 по 10 июня пройдут сборы. Запись у тренеров.',
        'status': 'PUBLISHED',
        'author': {'id': 'user-9', 'firstName': 'Ирина', 'lastName': 'Клуб'},
        'isPinned': true,
        'publishedAt': now.subtract(const Duration(days: 2)).toIso8601String(),
        'archivedAt': null,
        'createdAt': now.toIso8601String(),
        'updatedAt': now.toIso8601String(),
        'commentsCount': 0,
        'canEdit': false,
      },
      {
        'id': 'news-2',
        'title': 'Турнир клуба 15 ноября',
        'body': 'Открыта запись на внутренний турнир.',
        'status': 'PUBLISHED',
        'author': {'id': 'user-9', 'firstName': 'Ирина', 'lastName': 'Клуб'},
        'isPinned': false,
        'publishedAt': now.subtract(const Duration(days: 6)).toIso8601String(),
        'archivedAt': null,
        'createdAt': now.toIso8601String(),
        'updatedAt': now.toIso8601String(),
        'commentsCount': 0,
        'canEdit': false,
      },
    ],
  };

  // Чаты: групповой чат группы ребёнка и личная переписка с тренером.
  const user = {
    'userId': 'user-1',
    'firstName': 'Алия',
    'lastName': 'Демо',
    'role': 'PARENT',
  };
  const trainer = {
    'userId': 'user-2',
    'firstName': 'Иван',
    'lastName': 'Иванов',
    'role': 'TRAINER',
  };

  Map<String, dynamic> chatMessage(String id, Map<String, dynamic> sender, String body, int minutes) => {
        'id': id,
        'conversationId': 'conversation-1',
        'sender': sender,
        'body': body,
        'isDeleted': false,
        'canDelete': sender['userId'] == 'user-1',
        'createdAt': now.subtract(Duration(minutes: minutes)).toIso8601String(),
      };

  client.responses['GET /conversations'] = {
    'data': [
      {
        'id': 'conversation-1',
        'type': 'GROUP',
        'title': 'Дети 7-9 лет, новички',
        'groupId': 'group-1',
        'participants': [user, trainer],
        'lastMessage': chatMessage(
          'message-1',
          trainer,
          'Напоминаю: завтра занятие в 18:00',
          30,
        ),
        'unreadCount': 2,
        'lastMessageAt': now.subtract(const Duration(minutes: 30)).toIso8601String(),
        'createdAt': now.toIso8601String(),
      },
      {
        'id': 'conversation-2',
        'type': 'PRIVATE',
        'title': 'Иван Иванов',
        'groupId': null,
        'participants': [user, trainer],
        'lastMessage': chatMessage('message-2', user, 'Спасибо, будем', 180),
        'unreadCount': 0,
        'lastMessageAt': now.subtract(const Duration(hours: 3)).toIso8601String(),
        'createdAt': now.toIso8601String(),
      },
    ],
  };

  client.responses['GET /conversations/conversation-1'] = {
    'id': 'conversation-1',
    'type': 'GROUP',
    'title': 'Дети 7-9 лет, новички',
    'groupId': 'group-1',
    'participants': [user, trainer],
    'lastMessage': chatMessage('message-4', trainer, 'Хорошо, до завтра!', 5),
    'unreadCount': 0,
    'lastMessageAt': now.subtract(const Duration(minutes: 5)).toIso8601String(),
    'createdAt': now.toIso8601String(),
    'olderCursor': null,
    'messages': [
      chatMessage('message-1', trainer, 'Напоминаю: завтра занятие в 18:00', 40),
      chatMessage('message-2', user, 'Спасибо, будем', 30),
      chatMessage('message-3', user, 'Дамир немного приболел, но придёт', 25),
      chatMessage('message-4', trainer, 'Хорошо, до завтра!', 5),
    ],
  };

  client.responses['GET /attendance/athletes/athlete-1'] = {
    'data': [
      {
        'sessionId': 'session-1',
        'groupId': 'group-1',
        'groupName': 'Дети 7-9 лет, новички',
        'startsAt': now.subtract(const Duration(days: 2)).toUtc().toIso8601String(),
        'status': 'PRESENT',
        'comment': null,
        'markedAt': now.subtract(const Duration(days: 2)).toUtc().toIso8601String(),
      },
      {
        'sessionId': 'session-2',
        'groupId': 'group-1',
        'groupName': 'Дети 7-9 лет, новички',
        'startsAt': now.subtract(const Duration(days: 5)).toUtc().toIso8601String(),
        'status': 'ABSENT',
        'comment': 'Болезнь',
        'markedAt': now.subtract(const Duration(days: 5)).toUtc().toIso8601String(),
      },
      {
        'sessionId': 'session-3',
        'groupId': 'group-1',
        'groupName': 'Дети 7-9 лет, новички',
        'startsAt': now.subtract(const Duration(days: 9)).toUtc().toIso8601String(),
        'status': 'EXCUSED',
        'comment': 'Поездка с семьей',
        'markedAt': now.subtract(const Duration(days: 9)).toUtc().toIso8601String(),
      },
    ],
  };

  return client;
}

Future<AuthController> buildAuth(FakeApiClient client) async {
  final controller = AuthController(
    repository: AuthRepository(
      client: client,
      storage: InMemoryTokenStorage(),
    ),
  );
  client.responses['POST /auth/login'] = sessionResponse();
  await controller.login(email: 'aliya@octagon.local', password: 'secret-123');
  return controller;
}

MemberHomeController buildHome(FakeApiClient client) {
  return MemberHomeController(
    athletes: AthleteRepository(client: client),
    groups: GroupRepository(client: client),
    schedule: ScheduleRepository(client: client),
    attendance: AttendanceRepository(client: client),
    news: NewsRepository(client: client),
    payments: PaymentStatusRepository(client: client),
    clock: () => now,
  );
}

Widget wrap(Widget child) {
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: AppTheme.light(),
    home: Scaffold(body: SafeArea(child: child)),
  );
}

void main() {
  setUpAll(() async {
    await loadSystemFont();
  });

  testWidgets(skip: !Platform.isWindows, 'скриншот: главная участника', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final client = buildClient();
    final auth = await buildAuth(client);
    final home = buildHome(client);
    await home.load('token');

    await tester.pumpWidget(
      wrap(MemberHomeContent(auth: auth, controller: home, now: () => now)),
    );
    await tester.pumpAndSettle();

    await expectLater(
      find.byType(MemberHomeContent),
      matchesGoldenFile('goldens/home.png'),
    );
  });

  testWidgets(skip: !Platform.isWindows, 'скриншот: расписание', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final client = buildClient();
    final auth = await buildAuth(client);
    final schedule = ScheduleController(
      repository: ScheduleRepository(client: client),
      clock: () => now,
    );
    await schedule.load(token: 'token', groupId: 'group-1');

    await tester.pumpWidget(
      wrap(
        ScheduleScreen(
          auth: auth,
          controller: schedule,
          attendance: AttendanceRepository(client: client),
          athleteId: 'athlete-1',
          athleteName: 'Дамир Демо',
          groupId: 'group-1',
          refreshKey: 'group-1',
          now: () => now,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await expectLater(
      find.byType(ScheduleScreen),
      matchesGoldenFile('goldens/schedule.png'),
    );
  });

  testWidgets(skip: !Platform.isWindows, 'скриншот: новости', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final client = buildClient();
    final auth = await buildAuth(client);
    final news = NewsController(repository: NewsRepository(client: client));
    await news.load('token');

    await tester.pumpWidget(wrap(NewsScreen(auth: auth, controller: news)));
    await tester.pumpAndSettle();

    await expectLater(
      find.byType(NewsScreen),
      matchesGoldenFile('goldens/news.png'),
    );
  });

  testWidgets(skip: !Platform.isWindows, 'скриншот: профиль', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final client = buildClient();
    final auth = await buildAuth(client);

    await tester.pumpWidget(wrap(ProfileScreen(auth: auth)));
    await tester.pumpAndSettle();

    await expectLater(
      find.byType(ProfileScreen),
      matchesGoldenFile('goldens/profile.png'),
    );
  });

  testWidgets(
    skip: !Platform.isWindows,
    'скриншот: список чатов',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final client = buildClient();
      final auth = await buildAuth(client);
      final chats = ChatsController(repository: ChatRepository(client: client));
      await chats.load(token: 'token', currentUserId: 'user-1');

      await tester.pumpWidget(
        wrap(
          Scaffold(
            body: SafeArea(
              child: ChatsScreen(
                auth: auth,
                controller: chats,
                chatFactory: () => ChatController(repository: ChatRepository(client: client)),
      now: () => now,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byType(ChatsScreen),
        matchesGoldenFile('goldens/chats.png'),
      );
    },
  );

  testWidgets(
    skip: !Platform.isWindows,
    'скриншот: переписка',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final client = buildClient();
      final auth = await buildAuth(client);
      final chat = ChatController(repository: ChatRepository(client: client));
      await chat.load(
        token: 'token',
        conversationId: 'conversation-1',
        currentUserId: 'user-1',
      );

      await tester.pumpWidget(
        wrap(
          ChatScreen(
            auth: auth,
            controller: chat,
            title: 'Дети 7-9 лет, новички',
          ),
        ),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byType(ChatScreen),
        matchesGoldenFile('goldens/chat.png'),
      );
    },
  );

  testWidgets(
    skip: !Platform.isWindows,
    'скриншот: история посещений',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final client = buildClient();
      final auth = await buildAuth(client);
      final history = AttendanceHistoryController(
        repository: AttendanceRepository(client: client),
        clock: () => now,
      );
      await history.load(token: 'token', athleteId: 'athlete-1');

      await tester.pumpWidget(
        wrap(
          Scaffold(
            body: AttendanceHistoryScreen(
              auth: auth,
              controller: history,
              athleteId: 'athlete-1',
              athleteName: 'Дамир Демо',
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byType(AttendanceHistoryScreen),
        matchesGoldenFile('goldens/attendance_history.png'),
      );
    },
  );
}
