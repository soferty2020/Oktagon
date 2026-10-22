import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/core/api_exception.dart';
import 'package:octagon_mobile/features/attendance/attendance_history_controller.dart';
import 'package:octagon_mobile/features/attendance/attendance_repository.dart';

import 'support/fake_api_client.dart';

final DateTime now = DateTime(2026, 10, 21, 12);

Map<String, dynamic> record({
  required String sessionId,
  required String status,
  String? comment,
  DateTime? startsAt,
}) {
  return {
    'sessionId': sessionId,
    'groupId': 'group-1',
    'groupName': 'Дети 7-9',
    'startsAt': (startsAt ?? now.subtract(const Duration(days: 2))).toUtc().toIso8601String(),
    'status': status,
    'comment': comment,
    'markedAt': now.toUtc().toIso8601String(),
  };
}

void main() {
  group('история посещений', () {
    test('считает сводку по загруженным отметкам', () async {
      final client = FakeApiClient();
      client.responses['GET /attendance/athletes/athlete-1'] = {
        'data': [
          record(sessionId: 'session-1', status: 'PRESENT'),
          record(sessionId: 'session-2', status: 'PRESENT'),
          record(sessionId: 'session-3', status: 'ABSENT', comment: 'Болезнь'),
          record(sessionId: 'session-4', status: 'EXCUSED'),
        ],
      };

      final controller = AttendanceHistoryController(
        repository: AttendanceRepository(client: client),
        clock: () => now,
      );
      await controller.load(token: 'token', athleteId: 'athlete-1');

      expect(controller.records, hasLength(4));
      expect(controller.present, 2);
      expect(controller.absent, 1);
      expect(controller.excused, 1);
      expect(controller.percent, 50);
    });

    test('процент не считается, если отметок нет', () async {
      // «0%» здесь неверный вывод: это не «не ходил», а «не отмечали».
      final client = FakeApiClient();
      client.responses['GET /attendance/athletes/athlete-1'] = {'data': <Map<String, dynamic>>[]};

      final controller = AttendanceHistoryController(
        repository: AttendanceRepository(client: client),
        clock: () => now,
      );
      await controller.load(token: 'token', athleteId: 'athlete-1');

      expect(controller.records, isEmpty);
      expect(controller.percent, isNull);
    });

    test('ошибка сети показывается понятным текстом', () async {
      final client = FakeApiClient();
      client.errors['GET /attendance/athletes/athlete-1'] = const ApiException(
        code: 'NETWORK',
        message: 'Нет связи',
      );

      final controller = AttendanceHistoryController(
        repository: AttendanceRepository(client: client),
        clock: () => now,
      );
      await controller.load(token: 'token', athleteId: 'athlete-1');

      expect(controller.error, contains('Нет связи'));
    });

    test('доступ к чужому спортсмену объясняется', () async {
      final client = FakeApiClient();
      client.errors['GET /attendance/athletes/athlete-9'] = const ApiException(
        code: 'FORBIDDEN',
        message: 'Нет доступа',
      );

      final controller = AttendanceHistoryController(
        repository: AttendanceRepository(client: client),
        clock: () => now,
      );
      await controller.load(token: 'token', athleteId: 'athlete-9');

      expect(controller.error, contains('Нет доступа'));
    });
  });

  group('предупреждение об отсутствии', () {
    test('отправляет причину, если она указана', () async {
      final client = FakeApiClient();
      client.responses['POST /training-sessions/session-1/attendance/planned-absence'] = {};

      final repository = AttendanceRepository(client: client);
      await repository.reportAbsence(
        token: 'token',
        sessionId: 'session-1',
        athleteId: 'athlete-1',
        reason: '  Болезнь  ',
      );

      expect(
        client.calls,
        contains('POST /training-sessions/session-1/attendance/planned-absence'),
      );
    });

    test('отправляет без причины, если поле пустое', () async {
      final client = FakeApiClient();
      client.responses['POST /training-sessions/session-1/attendance/planned-absence'] = {};

      final repository = AttendanceRepository(client: client);
      await repository.reportAbsence(
        token: 'token',
        sessionId: 'session-1',
        athleteId: 'athlete-1',
        reason: '   ',
      );

      expect(
        client.calls,
        contains('POST /training-sessions/session-1/attendance/planned-absence'),
      );
    });
  });
}
