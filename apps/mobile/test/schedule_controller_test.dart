import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/core/api_exception.dart';
import 'package:octagon_mobile/features/schedule/schedule_controller.dart';
import 'package:octagon_mobile/features/schedule/schedule_repository.dart';

import 'support/fake_api_client.dart';

final DateTime now = DateTime(2026, 10, 21, 12);

Map<String, dynamic> session({
  required String id,
  required DateTime startsAt,
  String status = 'SCHEDULED',
}) {
  return {
    'id': id,
    'groupId': 'group-1',
    'groupName': 'Дети 7-9',
    'branchId': null,
    'hallId': null,
    'hallName': 'Зал 1',
    'trainerId': null,
    'trainerName': 'Серик Тренер',
    'startsAt': startsAt.toUtc().toIso8601String(),
    'endsAt': startsAt.add(const Duration(hours: 1)).toUtc().toIso8601String(),
    'status': status,
    'changeReason': null,
    'cancelledAt': null,
    'fromTemplate': true,
  };
}

void main() {
  late FakeApiClient client;
  late ScheduleController controller;

  setUp(() {
    client = FakeApiClient();
    controller = ScheduleController(
      repository: ScheduleRepository(client: client),
      clock: () => now,
    );
  });

  test('занятия группируются по дням и сортируются по времени', () async {
    client.responses['GET /training-sessions'] = {
      'data': [
        session(id: 'a2', startsAt: DateTime(2026, 10, 22, 18)),
        session(id: 'a1', startsAt: DateTime(2026, 10, 22, 10)),
        session(id: 'b1', startsAt: DateTime(2026, 10, 23, 9)),
      ],
    };

    await controller.load(token: 'token', groupId: 'group-1');

    expect(controller.days, hasLength(2));
    expect(controller.days.first.date.day, 22);
    // Внутри дня занятия идут по времени, а не в порядке ответа.
    expect(
      controller.days.first.sessions.map((item) => item.id),
      ['a1', 'a2'],
    );
    expect(controller.days.last.sessions.single.id, 'b1');
  });

  test('отмененные занятия в расписание не попадают', () async {
    // Место в календаре отмененное занятие уже не занимает, а отдельная пометка
    // на экране расписания только путала бы.
    client.responses['GET /training-sessions'] = {
      'data': [
        session(id: 'cancelled', startsAt: DateTime(2026, 10, 22, 10), status: 'CANCELLED'),
        session(id: 'active', startsAt: DateTime(2026, 10, 22, 12)),
      ],
    };

    await controller.load(token: 'token', groupId: 'group-1');

    expect(controller.days.single.sessions.single.id, 'active');
  });

  test('без группы расписание пустое и запрос не отправляется', () async {
    await controller.load(token: 'token', groupId: null);

    expect(controller.days, isEmpty);
    expect(controller.error, isNull);
    expect(client.calls, isEmpty);
  });

  test('ошибка сети показывается понятным текстом', () async {
    client.errors['GET /training-sessions'] = const ApiException(
      code: 'NETWORK',
      message: 'Нет связи',
    );

    await controller.load(token: 'token', groupId: 'group-1');

    expect(controller.error, contains('Нет связи'));
    expect(controller.days, isEmpty);
    expect(controller.loading, isFalse);
  });

  test('период запроса покрывает месяц', () async {
    client.responses['GET /training-sessions'] = {'data': <Map<String, dynamic>>[]};

    await controller.load(token: 'token', groupId: 'group-1');

    final query = client.queries.first;
    final from = DateTime.parse(query!['from']!);
    final to = DateTime.parse(query['to']!);
    // Проверяется, что запрос не «за весь год»: это лишняя нагрузка на телефон.
    expect(to.difference(from).inDays, inInclusiveRange(28, 32));
  });
}
