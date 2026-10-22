import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/app_theme.dart';
import 'package:octagon_mobile/features/auth/auth_controller.dart';
import 'package:octagon_mobile/features/auth/auth_repository.dart';
import 'package:octagon_mobile/features/schedule/schedule_models.dart';
import 'package:octagon_mobile/features/news/news_controller.dart';
import 'package:octagon_mobile/features/news/news_repository.dart';
import 'package:octagon_mobile/features/trainer/attendance_controller.dart';
import 'package:octagon_mobile/features/trainer/attendance_screen.dart';
import 'package:octagon_mobile/features/trainer/trainer_calendar_controller.dart';
import 'package:octagon_mobile/features/trainer/trainer_day_controller.dart';
import 'package:octagon_mobile/features/trainer/trainer_repository.dart';
import 'package:octagon_mobile/features/trainer/trainer_shell.dart';
import 'package:octagon_mobile/features/trainer/trainer_students_controller.dart';
import 'package:octagon_mobile/features/trainer/trainer_students_screen.dart';

import 'support/fake_api_client.dart';
import 'support/golden_fonts.dart';
import 'support/in_memory_token_storage.dart';
import 'auth_repository_test.dart' show sessionResponse;

/// Скриншоты экранов тренера.
///
/// Отдельный файл от экранов участника: у тренера другие данные и свои экраны.
/// Запуск с обновлением эталонов (только Windows):
///   flutter test --update-goldens test/golden_trainer_test.dart
final DateTime now = DateTime(2026, 10, 21, 12);

FakeApiClient buildClient() {
  final client = FakeApiClient();

  client.responses['GET /groups'] = {
    'data': [
      {'id': 'group-1', 'name': 'Дети 7-9, новички', 'activeMembersCount': 14},
      {'id': 'group-2', 'name': 'Дети 10-12', 'activeMembersCount': 11},
    ],
  };

  client.responses['GET /training-sessions'] = {
    'data': [
      {
        'id': 'session-1',
        'groupId': 'group-1',
        'groupName': 'Дети 7-9, новички',
        'branchId': null,
        'hallId': null,
        'hallName': 'Зал 1',
        'trainerId': null,
        'trainerName': 'Серик Тренеров',
        'startsAt': now.add(const Duration(hours: 6)).toUtc().toIso8601String(),
        'endsAt': now.add(const Duration(hours: 7, minutes: 30)).toUtc().toIso8601String(),
        'status': 'SCHEDULED',
        'changeReason': null,
        'cancelledAt': null,
        'fromTemplate': true,
      },
    ],
  };

  client.responses['GET /groups/group-1'] = {
    'id': 'group-1',
    'name': 'Дети 7-9, новички',
    'members': [
      {'athleteId': 'athlete-1', 'firstName': 'Дамир', 'lastName': 'Кузнецов'},
      {'athleteId': 'athlete-2', 'firstName': 'Алия', 'lastName': 'Смирнова'},
      {'athleteId': 'athlete-3', 'firstName': 'Артём', 'lastName': 'Волков'},
    ],
  };
  client.responses['GET /groups/group-2'] = {
    'id': 'group-2',
    'name': 'Дети 10-12',
    'members': [
      {'athleteId': 'athlete-2', 'firstName': 'Алия', 'lastName': 'Смирнова'},
      {'athleteId': 'athlete-4', 'firstName': 'София', 'lastName': 'Иванова'},
    ],
  };

  client.responses['GET /training-sessions/session-1/attendance'] = {
    'sessionId': 'session-1',
    'groupId': 'group-1',
    'groupName': 'Дети 7-9, новички',
    'startsAt': now.add(const Duration(hours: 6)).toUtc().toIso8601String(),
    'endsAt': now.add(const Duration(hours: 7, minutes: 30)).toUtc().toIso8601String(),
    'status': 'SCHEDULED',
    'markedCount': 1,
    'roster': [
      {
        'athleteId': 'athlete-1',
        'firstName': 'Дамир',
        'lastName': 'Кузнецов',
        'attendance': {'status': 'PRESENT'},
        'plannedAbsence': null,
      },
      {
        'athleteId': 'athlete-2',
        'firstName': 'Алия',
        'lastName': 'Смирнова',
        'attendance': null,
        'plannedAbsence': {'reason': 'Болезнь', 'reportedAt': now.toIso8601String()},
      },
      {
        'athleteId': 'athlete-3',
        'firstName': 'Артём',
        'lastName': 'Волков',
        'attendance': null,
        'plannedAbsence': null,
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
  client.responses['POST /auth/login'] = sessionResponse(role: 'STAFF');
  await controller.login(email: 'trainer@octagon.local', password: 'secret-123');
  return controller;
}

Widget wrap(Widget child) {
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: AppTheme.light(),
    home: child,
  );
}

void main() {
  setUpAll(() async {
    await loadGoldenFonts();
  });

  testWidgets(
    skip: !Platform.isWindows,
    'скриншот: оболочка тренера (тёмная шапка)',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final client = buildClient();
      client.responses['GET /news'] = {'data': <Map<String, dynamic>>[]};
      final auth = await buildAuth(client);

      final repository = TrainerRepository(client: client);
      final day = TrainerDayController(repository: repository, clock: () => now);
      await day.load('token');

      await tester.pumpWidget(
        wrap(
          TrainerShell(
            auth: auth,
            day: day,
            calendar: TrainerCalendarController(repository: repository, clock: () => now),
            students: TrainerStudentsController(repository: repository),
            news: NewsController(repository: NewsRepository(client: client)),
            attendanceFactory: () => AttendanceController(repository: repository),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byType(TrainerShell),
        matchesGoldenFile('goldens/trainer_shell.png'),
      );
    },
  );

  testWidgets(
    skip: !Platform.isWindows,
    'скриншот: ученики тренера',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final client = buildClient();
      final auth = await buildAuth(client);
      final students = TrainerStudentsController(
        repository: TrainerRepository(client: client),
      );
      await students.load('token');

      await tester.pumpWidget(
        wrap(
          Scaffold(
            body: SafeArea(
              child: TrainerStudentsScreen(auth: auth, controller: students),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byType(TrainerStudentsScreen),
        matchesGoldenFile('goldens/trainer_students.png'),
      );
    },
  );

  testWidgets(
    skip: !Platform.isWindows,
    'скриншот: журнал посещаемости',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final client = buildClient();
      final auth = await buildAuth(client);
      final attendance = AttendanceController(
        repository: TrainerRepository(client: client),
      );
      await attendance.load(token: 'token', sessionId: 'session-1');

      final session = TrainingSession(
        id: 'session-1',
        groupId: 'group-1',
        groupName: 'Дети 7-9, новички',
        hallName: 'Зал 1',
        trainerName: 'Серик Тренеров',
        startsAt: now.add(const Duration(hours: 6)),
        endsAt: now.add(const Duration(hours: 7, minutes: 30)),
        status: 'SCHEDULED',
      );

      await tester.pumpWidget(
        wrap(
          AttendanceScreen(
            auth: auth,
            controller: attendance,
            session: session,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byType(AttendanceScreen),
        matchesGoldenFile('goldens/trainer_attendance.png'),
      );
    },
  );
}
