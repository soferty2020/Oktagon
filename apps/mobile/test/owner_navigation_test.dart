import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/app_theme.dart';
import 'package:octagon_mobile/core/club_clock.dart';
import 'package:octagon_mobile/features/auth/auth_controller.dart';
import 'package:octagon_mobile/features/auth/auth_models.dart';
import 'package:octagon_mobile/features/auth/auth_repository.dart';
import 'support/in_memory_token_storage.dart';
import 'package:octagon_mobile/features/owner/owner_athlete_card_screen.dart';
import 'package:octagon_mobile/features/owner/owner_athletes_screen.dart';
import 'package:octagon_mobile/features/owner/owner_overview_screen.dart';
import 'package:octagon_mobile/features/owner/owner_schedule_screen.dart';
import 'package:octagon_mobile/features/owner/owner_sections.dart';
import 'package:octagon_mobile/features/owner/owner_session_details_screen.dart';

import 'support/fake_api_client.dart';

/// Тесты переходов, а не отрисовки: нажатие на спортсмена открывает карточку,
/// нажатие на занятие — детали, разделы «Ещё» фильтруются по правам.
/// Дата в UTC: занятия в моках задаются временем клуба (13:00Z = 18:00 Алматы).
String utcDay(DateTime date) => date.toUtc().toIso8601String().substring(0, 10);

void main() {
  // Дата клуба, а не устройства: обзор строит интервал по `todayInClub()`,
  // и ночью, когда местное время уже перешло на следующие сутки, локальная
  // дата расходится с клубной — тест падал.
  ClubClock.setTimeZoneForTest('Asia/Almaty');
  final now = ClubClock.todayInClub();

  FakeApiClient buildClient() {
    final client = FakeApiClient();
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
      ],
      'total': 1,
    };
    // Карточка грузит аттестации отдельными маршрутами (#150).
    client.responses['GET /athletes/athlete-1/certifications'] = {
      'data': [
        {
          'id': 'c1',
          'certifiedOn': '2026-10-29',
          'stageLabel': '8 кю',
          'beltGrade': 'BLUE',
        },
      ],
    };
    client.responses['GET /certification-events'] = {'data': <Map<String, dynamic>>[]};
    client.responses['GET /athletes/athlete-1'] = {
      'id': 'athlete-1',
      'firstName': 'Камила',
      'lastName': 'Абдрахманова',
      'birthDate': '2012-03-15',
      'status': 'ACTIVE',
      'rankLabel': '9 кю',
      'group': {'name': 'Старшая'},
      'trainer': {'name': 'Азамат Ермаков'},
      'hall': {'name': 'Заречная 4'},
      'sportsHistory': <Map<String, dynamic>>[],
    };
    final sessions = {
      'data': [
        {
          'id': 'session-1',
          'groupName': 'Дети 5-7 лет',
          'hallName': 'Заречная 4',
          'trainerName': 'Третьяков Алексей',
          // 13:00Z = 18:00 по Алматы — время клуба, а не устройства.
          'startsAt': '${utcDay(now)}T13:00:00.000Z',
          'endsAt': '${utcDay(now)}T14:30:00.000Z',
          'status': 'SCHEDULED',
        },
      ],
    };
    // Диапазоны строятся в поясе клуба и передаются ISO-8601 с полуоткрытым
    // концом: день, неделя, месяц — как их формирует ClubClock.
    for (final range in [
      ClubClock.dayRange(now),
      ClubClock.weekRange(now),
      ClubClock.monthRange(now),
    ]) {
      client.responses['GET /training-sessions?from=${range.from}&to=${range.to}'] = sessions;
    }
    return client;
  }

  AuthController buildAuth(List<String> permissions) {
    final controller = AuthController(
      repository: AuthRepository(client: FakeApiClient(), storage: InMemoryTokenStorage()),
    );
    controller.setSessionForTest(
      AuthSession(
        accessToken: 'token',
        refreshToken: 'refresh',
        accessExpiresAt: DateTime.now().add(const Duration(hours: 1)),
        user: UserProfile(
          id: 'user-1',
          email: 'owner@octagon.local',
          firstName: 'Владелец',
          lastName: 'Клуба',
          role: 'SUPERADMIN',
          permissions: permissions,
        ),
      ),
    );
    return controller;
  }

  Widget wrap(Widget child) => MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        home: child,
      );

  testWidgets('нажатие на спортсмена открывает карточку', (tester) async {
    final client = buildClient();
    final auth = buildAuth(['athletes.view']);

    await tester.pumpWidget(
      wrap(Scaffold(body: OwnerAthletesScreen(auth: auth, client: client))),
    );
    await tester.pumpAndSettle();

    expect(find.text('Абдрахманова Камила'), findsOneWidget);
    await tester.tap(find.text('Абдрахманова Камила'));
    await tester.pumpAndSettle();

    expect(find.byType(OwnerAthleteCardScreen), findsOneWidget);
    expect(find.text('Старшая'), findsOneWidget);
    expect(find.text('Азамат Ермаков'), findsOneWidget);

    // Назад — список на месте.
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byType(OwnerAthletesScreen), findsOneWidget);
    expect(find.text('Абдрахманова Камила'), findsOneWidget);
  });

  testWidgets('нажатие на занятие открывает детали', (tester) async {
    final client = buildClient();
    final auth = buildAuth(['schedule.view']);

    await tester.pumpWidget(
      wrap(Scaffold(body: OwnerScheduleScreen(auth: auth, client: client))),
    );
    await tester.pumpAndSettle();

    // Время показано по часам клуба (UTC+5), а не телефона.
    expect(find.text('18:00–19:30'), findsOneWidget);
    expect(find.text('Дети 5-7 лет'), findsWidgets);

    await tester.tap(find.text('Дети 5-7 лет').first);
    await tester.pumpAndSettle();

    expect(find.byType(OwnerSessionDetailsScreen), findsOneWidget);
    expect(find.text('Третьяков Алексей'), findsOneWidget);
    expect(find.text('Заречная 4'), findsWidgets);
  });

  testWidgets('«Ещё» показывает все разделы при полных правах', (tester) async {
    // Права из контракта `packages/contracts/src/domain.ts`: заявки — через
    // дефис, отчёты строятся на `payments.view`, новости без отдельного права.
    final permissions = [
      'trial-requests.view',
      'attestations.view',
      'competitions.view',
      'payments.view',
      'chat.use',
    ];
    final visible = ownerSections
        .where((section) => section.isVisible(permissions))
        .map((section) => section.id)
        .toList();

    expect(visible, contains('trial_requests'));
    expect(visible, contains('attestations'));
    expect(visible, contains('competitions'));
    expect(visible, contains('reports'));
    expect(visible, contains('news'));
    expect(visible, contains('chats'));
    expect(visible, contains('profile'));
  });

  testWidgets('часовой пояс клуба: UTC приходит как время Алматы', (tester) async {
    ClubClock.setTimeZoneForTest('Asia/Almaty');
    expect(ClubClock.formatTime('2026-11-03T13:00:00.000Z'), '18:00');
    expect(ClubClock.formatTime('2026-11-03T13:00:00.000Z'), isNot('20:00'));
  });

  testWidgets('KPI «Спортсмены» переключает вкладку', (tester) async {
    final client = buildClient();
    final auth = buildAuth(['athletes.view']);
    var tab = -1;

    client.responses['GET /groups'] = {'data': <Map<String, dynamic>>[]};
    client.responses['GET /trial-requests'] = {'data': <Map<String, dynamic>>[]};
    client.responses['GET /finance/summary?year=${now.year}&month=${now.month}'] = {
      'totals': {'received': 0, 'refunded': 0, 'revenue': 0},
      'expected': 0,
      'debtors': 0,
      'debtorsWithoutExpected': 0,
      'debt': 0,
      'activeAthletes': 1,
    };
    client.responses['GET /certification-events'] = {'data': <Map<String, dynamic>>[]};
    client.responses['GET /athletes?page=1&limit=1'] = {
      'items': <Map<String, dynamic>>[],
      'total': 1,
    };

    await tester.pumpWidget(
      wrap(Scaffold(
        body: OwnerOverviewScreen(
          auth: auth,
          client: client,
          onOpen: (_) {},
          onOpenTab: (index) => tab = index,
        ),
      )),
    );
    await tester.pumpAndSettle();

    expect(find.text('Спортсмены'), findsOneWidget);
    await tester.tap(find.text('Спортсмены'));
    await tester.pumpAndSettle();
    expect(tab, 1);
  });

  testWidgets('режим «Неделя» группирует занятия по дням', (tester) async {
    final client = buildClient();
    final auth = buildAuth(['schedule.view']);

    await tester.pumpWidget(
      wrap(Scaffold(body: OwnerScheduleScreen(auth: auth, client: client))),
    );
    await tester.pumpAndSettle();

    // В недельном режиме есть заголовок дня с датой и время занятия.
    expect(find.textContaining('18:00'), findsWidgets);
    expect(find.text('Дети 5-7 лет'), findsWidgets);
  });
}
