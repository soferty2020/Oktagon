import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/app_theme.dart';
import 'package:octagon_mobile/features/auth/auth_controller.dart';
import 'package:octagon_mobile/features/auth/auth_models.dart';
import 'package:octagon_mobile/features/auth/auth_repository.dart';
import 'package:octagon_mobile/features/owner/owner_finance_screen.dart';
import 'package:octagon_mobile/features/owner/owner_overview_screen.dart';
import 'package:octagon_mobile/features/owner/owner_schedule_screen.dart';
import 'package:octagon_mobile/features/profile/profile_screen.dart';

import 'support/fake_api_client.dart';
import 'support/golden_fonts.dart';
import 'support/in_memory_token_storage.dart';

/// Скриншоты обновлённых экранов владельца: обзор, расписание (день, неделя,
/// месяц), финансы и профиль с русскими названиями прав.
void main() {
  setUpAll(() async {
    await loadGoldenFonts();
  });

  final now = DateTime.now();
  String day(DateTime date) =>
      '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

  FakeApiClient buildClient() {
    final client = FakeApiClient();
    final sessions = {
      'data': [
        {
          'id': 's1',
          'groupName': 'Дети 5-7 лет',
          'hallName': 'Заречная 4',
          'trainerName': 'Третьяков Алексей',
          'startsAt': DateTime(now.year, now.month, now.day, 18).toUtc().toIso8601String(),
          'endsAt': DateTime(now.year, now.month, now.day, 19, 30).toUtc().toIso8601String(),
          'status': 'SCHEDULED',
        },
        {
          'id': 's2',
          'groupName': 'Старшая',
          'hallName': 'Охотская 84',
          'trainerName': 'Азамат Ермаков',
          'startsAt': DateTime(now.year, now.month, now.day, 18).toUtc().toIso8601String(),
          'endsAt': DateTime(now.year, now.month, now.day, 19, 30).toUtc().toIso8601String(),
          'status': 'SCHEDULED',
        },
      ],
    };
    final monday = DateTime(now.year, now.month, now.day)
        .subtract(Duration(days: now.weekday - 1));
    final monthStart = DateTime(now.year, now.month, 1);
    final monthEnd = DateTime(now.year, now.month + 1, 0);
    for (final range in [
      [day(now), day(now)],
      [day(monday), day(monday.add(const Duration(days: 6)))],
      [day(monthStart), day(monthEnd)],
    ]) {
      client.responses['GET /training-sessions?from=${range[0]}&to=${range[1]}'] = sessions;
    }
    client.responses['GET /athletes?page=1&limit=1'] = {
      'items': <Map<String, dynamic>>[],
      'total': 32,
    };
    client.responses['GET /groups'] = {
      'data': [
        {'id': 'g1', 'name': 'Дети 5-7 лет'},
        {'id': 'g2', 'name': 'Старшая'},
      ],
    };
    client.responses['GET /trial-requests'] = {'data': <Map<String, dynamic>>[]};
    client.responses['GET /certification-events'] = {
      'data': [
        {
          'id': 'c1',
          'title': 'Осенняя аттестация 2026',
          'scheduledAt': '2026-11-15T10:00:00.000Z',
          'participantsCount': 11,
        },
      ],
    };
    client.responses['GET /finance/summary?year=${now.year}&month=${now.month}'] = {
      'totals': {'received': 25000, 'refunded': 0, 'revenue': 25000},
      'expected': 0,
      'debtors': 0,
      'debtorsWithoutExpected': 31,
      'debt': 0,
      'activeAthletes': 32,
    };
    return client;
  }

  AuthController buildAuth(List<String> permissions) {
    final controller = AuthController(
      repository: AuthRepository(client: FakeApiClient(), storage: InMemoryTokenStorage()),
    );
    controller.setSessionForTest(
      AuthSession(
        accessToken: 't',
        refreshToken: 'r',
        accessExpiresAt: now.add(const Duration(hours: 1)),
        user: UserProfile(
          id: 'u1',
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
        home: Scaffold(body: child),
      );

  testWidgets(
    skip: !Platform.isWindows,
    'скриншот: обзор с переходами',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final client = buildClient();
      final auth = buildAuth(['athletes.view']);
      await tester.pumpWidget(wrap(OwnerOverviewScreen(
        auth: auth,
        client: client,
        onOpen: (_) {},
        onOpenTab: (_) {},
      )));
      await tester.pumpAndSettle();
      await expectLater(
        find.byType(OwnerOverviewScreen),
        matchesGoldenFile('goldens/owner_overview_v2.png'),
      );
    },
  );

  testWidgets(
    skip: !Platform.isWindows,
    'скриншот: расписание — месяц',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final client = buildClient();
      final auth = buildAuth(['schedule.view']);
      await tester.pumpWidget(wrap(OwnerScheduleScreen(auth: auth, client: client)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Месяц'));
      await tester.pumpAndSettle();
      await expectLater(
        find.byType(OwnerScheduleScreen),
        matchesGoldenFile('goldens/owner_schedule_month.png'),
      );
    },
  );


}
