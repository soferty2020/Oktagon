import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/core/api_exception.dart';
import 'package:octagon_mobile/features/trainer/attendance_controller.dart';
import 'package:octagon_mobile/features/trainer/trainer_day_controller.dart';
import 'package:octagon_mobile/features/trainer/trainer_models.dart';
import 'package:octagon_mobile/features/trainer/trainer_repository.dart';
import 'package:octagon_mobile/features/trainer/trainer_students_controller.dart';

import 'support/fake_api_client.dart';

final DateTime now = DateTime(2026, 10, 21, 12);

Map<String, dynamic> session({
  required String id,
  required String groupName,
  required DateTime startsAt,
  String status = 'SCHEDULED',
}) {
  return {
    'id': id,
    'groupId': 'group-1',
    'groupName': groupName,
    'branchId': null,
    'hallId': null,
    'hallName': 'Зал 1',
    'trainerId': null,
    'trainerName': 'Серик Тренеров',
    'startsAt': startsAt.toUtc().toIso8601String(),
    'endsAt': startsAt.add(const Duration(hours: 1)).toUtc().toIso8601String(),
    'status': status,
    'changeReason': null,
    'cancelledAt': null,
    'fromTemplate': true,
  };
}

Map<String, dynamic> journal({int markedCount = 0}) {
  return {
    'sessionId': 'session-1',
    'groupId': 'group-1',
    'groupName': 'Дети 7-9',
    'startsAt': now.add(const Duration(hours: 1)).toUtc().toIso8601String(),
    'endsAt': now.add(const Duration(hours: 2)).toUtc().toIso8601String(),
    'status': 'SCHEDULED',
    'markedCount': markedCount,
    'roster': [
      {
        'athleteId': 'athlete-1',
        'firstName': 'Дамир',
        'lastName': 'Демо',
        'attendance': null,
        'plannedAbsence': null,
      },
      {
        'athleteId': 'athlete-2',
        'firstName': 'Алия',
        'lastName': 'Демо',
        'attendance': null,
        'plannedAbsence': {'reason': 'Болезнь', 'reportedAt': now.toIso8601String()},
      },
    ],
  };
}

void main() {
  group('сегодня у тренера', () {
    test('считает занятия, группы и учеников', () async {
      final client = FakeApiClient();
      client.responses['GET /groups'] = {
        'data': [
          {'id': 'group-1', 'name': 'Дети 7-9', 'activeMembersCount': 12},
          {'id': 'group-2', 'name': 'Дети 10-12', 'activeMembersCount': 8},
        ],
      };
      client.responses['GET /training-sessions'] = {
        'data': [
          session(
            id: 'session-1',
            groupName: 'Дети 7-9',
            startsAt: now.add(const Duration(hours: 1)),
          ),
        ],
      };

      final controller = TrainerDayController(
        repository: TrainerRepository(client: client),
        clock: () => now,
      );
      await controller.load('token');

      expect(controller.groupsCount, 2);
      expect(controller.studentsCount, 20);
      expect(controller.sessionsCount, greaterThan(0));
    });

    test('отмененные занятия не попадают в список', () async {
      final client = FakeApiClient();
      client.responses['GET /groups'] = {
        'data': [
          {'id': 'group-1', 'name': 'Дети 7-9', 'activeMembersCount': 12},
        ],
      };
      client.responses['GET /training-sessions'] = {
        'data': [
          session(
            id: 'cancelled',
            groupName: 'Дети 7-9',
            startsAt: now.add(const Duration(hours: 1)),
            status: 'CANCELLED',
          ),
          session(
            id: 'active',
            groupName: 'Дети 7-9',
            startsAt: now.add(const Duration(hours: 3)),
          ),
        ],
      };

      final controller = TrainerDayController(
        repository: TrainerRepository(client: client),
        clock: () => now,
      );
      await controller.load('token');

      expect(controller.todaySessions.map((item) => item.id), ['active']);
      expect(controller.sessionsCount, 1);
    });

    test('ошибка сети показывается понятным текстом', () async {
      final client = FakeApiClient();
      client.errors['GET /groups'] = const ApiException(
        code: 'NETWORK',
        message: 'Нет связи',
      );

      final controller = TrainerDayController(
        repository: TrainerRepository(client: client),
        clock: () => now,
      );
      await controller.load('token');

      expect(controller.error, contains('Нет связи'));
    });
  });

  group('журнал посещаемости', () {
    test('загружает состав и предупреждение родителя', () async {
      final client = FakeApiClient();
      client.responses['GET /training-sessions/session-1/attendance'] = journal();

      final controller = AttendanceController(
        repository: TrainerRepository(client: client),
      );
      await controller.load(token: 'token', sessionId: 'session-1');

      expect(controller.journal?.roster, hasLength(2));
      expect(controller.journal?.roster.last.plannedAbsenceReason, 'Болезнь');
      expect(controller.hasChanges, isFalse);
    });

    test('отметка сохраняется только для измененных', () async {
      final client = FakeApiClient();
      client.responses['GET /training-sessions/session-1/attendance'] = journal();
      client.responses['PUT /training-sessions/session-1/attendance'] = journal(markedCount: 1);

      final controller = AttendanceController(
        repository: TrainerRepository(client: client),
      );
      await controller.load(token: 'token', sessionId: 'session-1');

      controller.setState('athlete-1', AttendanceState.present);
      expect(controller.hasChanges, isTrue);

      final saved = await controller.save(token: 'token');

      expect(saved, isTrue);
      expect(client.calls, contains('PUT /training-sessions/session-1/attendance'));
      expect(controller.hasChanges, isFalse);
    });

    test('повторный выбор того же статуса снимает правку', () async {
      // Тренер мог нажать по ошибке: повторное нажатие должно вернуть состояние
      // «без изменений», иначе кнопка «Сохранить» останется активной зря.
      final client = FakeApiClient();
      client.responses['GET /training-sessions/session-1/attendance'] = journal();

      final controller = AttendanceController(
        repository: TrainerRepository(client: client),
      );
      await controller.load(token: 'token', sessionId: 'session-1');

      controller.setState('athlete-1', AttendanceState.present);
      controller.setState('athlete-1', AttendanceState.none);

      expect(controller.hasChanges, isFalse);
    });

    test('ошибка сохранения не теряет отметки', () async {
      final client = FakeApiClient();
      client.responses['GET /training-sessions/session-1/attendance'] = journal();
      client.errors['PUT /training-sessions/session-1/attendance'] = const ApiException(
        code: 'NETWORK',
        message: 'Нет связи',
      );

      final controller = AttendanceController(
        repository: TrainerRepository(client: client),
      );
      await controller.load(token: 'token', sessionId: 'session-1');
      controller.setState('athlete-1', AttendanceState.absent);

      final saved = await controller.save(token: 'token');

      expect(saved, isFalse);
      expect(controller.error, contains('Нет связи'));
      // Главное: правки остались, иначе тренер потерял бы отметки из-за сбоя сети.
      expect(controller.hasChanges, isTrue);
      expect(controller.stateFor('athlete-1'), AttendanceState.absent);
    });
  });

  group('ученики тренера', () {
    test('один ребенок из двух групп показывается один раз', () async {
      final client = FakeApiClient();
      client.responses['GET /groups'] = {
        'data': [
          {'id': 'group-1', 'name': 'Дети 7-9', 'activeMembersCount': 1},
          {'id': 'group-2', 'name': 'Дети 10-12', 'activeMembersCount': 1},
        ],
      };
      client.responses['GET /groups/group-1'] = {
        'id': 'group-1',
        'name': 'Дети 7-9',
        'members': [
          {'athleteId': 'athlete-1', 'firstName': 'Дамир', 'lastName': 'Демо'},
        ],
      };
      client.responses['GET /groups/group-2'] = {
        'id': 'group-2',
        'name': 'Дети 10-12',
        'members': [
          {'athleteId': 'athlete-1', 'firstName': 'Дамир', 'lastName': 'Демо'},
          {'athleteId': 'athlete-2', 'firstName': 'Алия', 'lastName': 'Демо'},
        ],
      };

      final controller = TrainerStudentsController(
        repository: TrainerRepository(client: client),
      );
      await controller.load('token');

      expect(controller.totalCount, 2);
      final damir = controller.students.firstWhere(
        (student) => student.athleteId == 'athlete-1',
      );
      expect(damir.groupNames, hasLength(2));
    });

    test('поиск фильтрует список', () async {
      final client = FakeApiClient();
      client.responses['GET /groups'] = {
        'data': [
          {'id': 'group-1', 'name': 'Дети 7-9', 'activeMembersCount': 2},
        ],
      };
      client.responses['GET /groups/group-1'] = {
        'id': 'group-1',
        'name': 'Дети 7-9',
        'members': [
          {'athleteId': 'athlete-1', 'firstName': 'Дамир', 'lastName': 'Демо'},
          {'athleteId': 'athlete-2', 'firstName': 'Алия', 'lastName': 'Демо'},
        ],
      };

      final controller = TrainerStudentsController(
        repository: TrainerRepository(client: client),
      );
      await controller.load('token');

      controller.search('алия');

      expect(controller.students, hasLength(1));
      expect(controller.students.first.firstName, 'Алия');
    });
  });
}
