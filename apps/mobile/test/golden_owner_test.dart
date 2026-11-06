import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/app_theme.dart';
import 'package:octagon_mobile/features/attestations/attestation_controller.dart';
import 'package:octagon_mobile/features/attestations/attestation_repository.dart';
import 'package:octagon_mobile/features/auth/auth_controller.dart';
import 'package:octagon_mobile/features/auth/auth_repository.dart';
import 'package:octagon_mobile/features/chat/chat_controller.dart';
import 'package:octagon_mobile/features/chat/chats_controller.dart';
import 'package:octagon_mobile/features/chat/chat_repository.dart';
import 'package:octagon_mobile/features/news/news_controller.dart';
import 'package:octagon_mobile/features/news/news_repository.dart';
import 'package:octagon_mobile/features/owner/owner_athletes_screen.dart';
import 'package:octagon_mobile/features/owner/owner_finance_screen.dart';
import 'package:octagon_mobile/features/owner/owner_overview_screen.dart';
import 'package:octagon_mobile/features/owner/owner_schedule_screen.dart';
import 'package:octagon_mobile/features/owner/owner_shell.dart';
import 'package:octagon_mobile/features/admin/trial_requests_screen.dart';

import 'support/fake_api_client.dart';
import 'support/in_memory_token_storage.dart';
import 'support/golden_fonts.dart';
import 'auth_repository_test.dart' show sessionResponse;

/// Скриншоты экранов владельца.
///
/// Данные — те же формы, что отдаёт API: списки приходят в `data`, страницы —
/// в `items`. Обновление эталонов (только Windows):
///   flutter test --update-goldens test/golden_owner_test.dart
final DateTime now = DateTime.now();

String two(int value) => value.toString().padLeft(2, '0');
String day(DateTime date) => '${date.year}-${two(date.month)}-${two(date.day)}';

FakeApiClient buildClient() {
  final client = FakeApiClient();

  client.responses['GET /athletes?page=1&limit=1'] = {
    'items': <Map<String, dynamic>>[],
    'total': 32,
  };

  client.responses['GET /groups'] = {
    'data': [
      {'id': 'group-1', 'name': 'Дети 5-7 лет', 'activeMembersCount': 14},
      {'id': 'group-2', 'name': 'Старшая', 'activeMembersCount': 11},
    ],
  };

  client.responses['GET /training-sessions?from=${day(now)}&to=${day(now)}'] = {
    'data': [
      {
        'id': 'session-1',
        'groupName': 'Школьники 8–12 лет',
        'hallName': 'Заречная 4',
        'startsAt': DateTime(now.year, now.month, now.day, 18).toUtc().toIso8601String(),
        'endsAt': DateTime(now.year, now.month, now.day, 19, 30).toUtc().toIso8601String(),
        'status': 'SCHEDULED',
      },
    ],
  };

  client.responses['GET /trial-requests'] = {'data': <Map<String, dynamic>>[]};

  client.responses['GET /finance/summary?year=${now.year}&month=${now.month}'] = {
    'year': now.year,
    'month': now.month,
    'totals': {'received': 25000, 'refunded': 0, 'revenue': 25000},
    'expected': 0,
    'debtors': 0,
    'debtorsWithoutExpected': 31,
    'debt': 0,
    'activeAthletes': 32,
  };

  client.responses['GET /certification-events'] = {
    'data': [
      {
        'id': 'cert-1',
        'title': 'Осенняя аттестация 2026',
        'scheduledAt': '2026-11-15T10:00:00.000Z',
        'location': 'Центральный зал',
        'participantsCount': 11,
      },
    ],
  };

  client.responses['GET /athletes?page=1&limit=30'] = {
    'items': [
      {
        'id': 'athlete-1',
        'firstName': 'Камила',
        'lastName': 'Абдрахманова',
        'birthDate': '2012-03-15',
        'groupName': 'Старшая',
        'status': 'ACTIVE',
      },
      {
        'id': 'athlete-2',
        'firstName': 'Али',
        'lastName': 'Абдрахманов',
        'birthDate': '2019-01-10',
        'groupName': 'Дети 5-7 лет',
        'status': 'ACTIVE',
      },
      {
        'id': 'athlete-3',
        'firstName': 'Ева',
        'lastName': 'Ким',
        'birthDate': '2018-07-02',
        'groupName': 'Младшая',
        'status': 'FROZEN',
      },
    ],
    'total': 32,
  };

  client.responses['GET /payment-transactions?page=1&limit=10'] = {
    'data': [
      {
        'id': 'pay-1',
        'amount': 15000,
        'paidAt': '2026-11-05T09:00:00.000Z',
        'athlete': {'firstName': 'Камила', 'lastName': 'Абдрахманова'},
      },
      {
        'id': 'pay-2',
        'amount': 10000,
        'paidAt': '2026-11-05T10:00:00.000Z',
        'athlete': {'firstName': 'Максим', 'lastName': 'Соколов'},
      },
    ],
  };

  return client;
}

Widget wrap(Widget child) {
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: AppTheme.light(),
    home: child,
  );
}

Future<AuthController> buildAuth(FakeApiClient client) async {
  final controller = AuthController(
    repository: AuthRepository(
      client: client,
      storage: InMemoryTokenStorage(),
    ),
  );
  client.responses['POST /auth/login'] = sessionResponse(role: 'SUPERADMIN');
  await controller.login(email: 'owner@octagon.local', password: 'secret-123');
  return controller;
}

void main() {
  setUpAll(() async {
    await loadGoldenFonts();
  });

  testWidgets(
    skip: !Platform.isWindows,
    'скриншот: обзор владельца',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final client = buildClient();
      final auth = await buildAuth(client);

      await tester.pumpWidget(
        wrap(
          OwnerOverviewScreen(
            auth: auth,
            client: client,
            onOpen: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byType(OwnerOverviewScreen),
        matchesGoldenFile('goldens/owner_overview.png'),
      );
    },
  );

  testWidgets(
    skip: !Platform.isWindows,
    'скриншот: спортсмены владельца',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final client = buildClient();
      final auth = await buildAuth(client);

      await tester.pumpWidget(
        wrap(Scaffold(body: OwnerAthletesScreen(auth: auth, client: client))),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byType(OwnerAthletesScreen),
        matchesGoldenFile('goldens/owner_athletes.png'),
      );
    },
  );

  testWidgets(
    skip: !Platform.isWindows,
    'скриншот: финансы владельца',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final client = buildClient();
      final auth = await buildAuth(client);

      await tester.pumpWidget(
        wrap(Scaffold(body: OwnerFinanceScreen(auth: auth, client: client))),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byType(OwnerFinanceScreen),
        matchesGoldenFile('goldens/owner_finance.png'),
      );
    },
  );

  testWidgets(
    skip: !Platform.isWindows,
    'скриншот: расписание владельца',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final client = buildClient();
      final auth = await buildAuth(client);

      await tester.pumpWidget(
        wrap(Scaffold(body: OwnerScheduleScreen(auth: auth, client: client))),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byType(OwnerScheduleScreen),
        matchesGoldenFile('goldens/owner_schedule.png'),
      );
    },
  );

  testWidgets(
    skip: !Platform.isWindows,
    'скриншот: оболочка владельца с логотипом',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final client = buildClient();
      final auth = await buildAuth(client);

      await tester.pumpWidget(
        wrap(
          OwnerShell(
            auth: auth,
            attestations: AttestationController(
              repository: ApiAttestationRepository(client: client),
            ),
            trialRequests: TrialRequestsController(
              repository: TrialRequestsRepository(client: client),
            ),
            news: NewsController(repository: NewsRepository(client: client)),
            chats: ChatsController(repository: ChatRepository(client: client)),
            chatFactory: () => ChatController(repository: ChatRepository(client: client)),
            client: client,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byType(OwnerShell),
        matchesGoldenFile('goldens/owner_shell.png'),
      );
    },
  );
}
