import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/core/api_exception.dart';
import 'package:octagon_mobile/features/athletes/athlete_repository.dart';
import 'package:octagon_mobile/features/attendance/attendance_repository.dart';
import 'package:octagon_mobile/features/groups/group_repository.dart';
import 'package:octagon_mobile/features/home/member_home_controller.dart';
import 'package:octagon_mobile/features/news/news_repository.dart';
import 'package:octagon_mobile/features/schedule/schedule_repository.dart';

import 'support/fake_api_client.dart';

/// Фиксированное «сейчас»: иначе «ближайшее занятие» зависело бы от даты запуска.
final DateTime now = DateTime(2026, 10, 21, 12);

Map<String, dynamic> athlete({
  required String id,
  required String firstName,
  bool isPrimary = false,
}) {
  return {
    'id': id,
    'firstName': firstName,
    'lastName': 'Серик',
    'middleName': null,
    'birthDate': '2015-03-01',
    'status': 'ACTIVE',
    'relation': 'PARENT',
    'isPrimary': isPrimary,
  };
}

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

MemberHomeController buildController(FakeApiClient client) {
  return MemberHomeController(
    athletes: AthleteRepository(client: client),
    groups: GroupRepository(client: client),
    schedule: ScheduleRepository(client: client),
    attendance: AttendanceRepository(client: client),
    news: NewsRepository(client: client),
    clock: () => now,
  );
}

void main() {
  late FakeApiClient client;

  setUp(() {
    client = FakeApiClient();
  });

  group('выбор спортсмена', () {
    test('основной спортсмен открывается первым', () async {
      client.responses['GET /me/athletes'] = {
        'data': [
          athlete(id: 'athlete-1', firstName: 'Алия'),
          athlete(id: 'athlete-2', firstName: 'Дамир', isPrimary: true),
        ],
      };
      client.responses['GET /groups/by-athlete/athlete-2'] = {
        'id': 'group-2',
        'name': 'Дети 10-12',
      };
      client.responses['GET /training-sessions'] = {'data': <Map<String, dynamic>>[]};
      client.responses['GET /attendance/summary'] = {'data': <Map<String, dynamic>>[]};
      client.responses['GET /news'] = {'data': <Map<String, dynamic>>[]};

      final controller = buildController(client);
      await controller.load('token');

      expect(controller.selected?.id, 'athlete-2');
      expect(controller.group?.name, 'Дети 10-12');
    });

    test('переключение подгружает данные другого спортсмена', () async {
      client.responses['GET /me/athletes'] = {
        'data': [
          athlete(id: 'athlete-1', firstName: 'Алия', isPrimary: true),
          athlete(id: 'athlete-2', firstName: 'Дамир'),
        ],
      };
      client.responses['GET /groups/by-athlete/athlete-1'] = {
        'id': 'group-1',
        'name': 'Дети 7-9',
      };
      client.responses['GET /groups/by-athlete/athlete-2'] = {
        'id': 'group-2',
        'name': 'Дети 10-12',
      };
      client.responses['GET /training-sessions'] = {'data': <Map<String, dynamic>>[]};
      client.responses['GET /attendance/summary'] = {'data': <Map<String, dynamic>>[]};
      client.responses['GET /news'] = {'data': <Map<String, dynamic>>[]};

      final controller = buildController(client);
      await controller.load('token');

      await controller.select(controller.athletes[1]);

      expect(controller.selected?.id, 'athlete-2');
      expect(controller.group?.name, 'Дети 10-12');
    });

    test('без связанных спортсменов состояние пустое', () async {
      client.responses['GET /me/athletes'] = {'data': <Map<String, dynamic>>[]};

      final controller = buildController(client);
      await controller.load('token');

      expect(controller.athletes, isEmpty);
      expect(controller.selected, isNull);
      expect(controller.error, isNull);
    });
  });

  group('ближайшая тренировка', () {
    test('выбирается первое будущее занятие', () async {
      client.responses['GET /me/athletes'] = {
        'data': [athlete(id: 'athlete-1', firstName: 'Алия', isPrimary: true)],
      };
      client.responses['GET /groups/by-athlete/athlete-1'] = {
        'id': 'group-1',
        'name': 'Дети 7-9',
      };
      client.responses['GET /training-sessions'] = {
        'data': [
          // Занятие в прошлом не должно считаться ближайшим.
          session(id: 'past', startsAt: now.subtract(const Duration(days: 1))),
          // Отмененное тоже пропускается.
          session(
            id: 'cancelled',
            startsAt: now.add(const Duration(hours: 2)),
            status: 'CANCELLED',
          ),
          session(id: 'next', startsAt: now.add(const Duration(days: 1))),
          session(id: 'later', startsAt: now.add(const Duration(days: 3))),
        ],
      };
      client.responses['GET /attendance/summary'] = {'data': <Map<String, dynamic>>[]};
      client.responses['GET /news'] = {'data': <Map<String, dynamic>>[]};

      final controller = buildController(client);
      await controller.load('token');

      expect(controller.nextSession?.id, 'next');
    });

    test('запрос ограничен группой и периодом', () async {
      client.responses['GET /me/athletes'] = {
        'data': [athlete(id: 'athlete-1', firstName: 'Алия', isPrimary: true)],
      };
      client.responses['GET /groups/by-athlete/athlete-1'] = {
        'id': 'group-1',
        'name': 'Дети 7-9',
      };
      client.responses['GET /training-sessions'] = {'data': <Map<String, dynamic>>[]};
      client.responses['GET /attendance/summary'] = {'data': <Map<String, dynamic>>[]};
      client.responses['GET /news'] = {'data': <Map<String, dynamic>>[]};

      final controller = buildController(client);
      await controller.load('token');

      final index = client.calls.indexOf('GET /training-sessions');
      final query = client.queries[index];
      expect(query?['groupId'], 'group-1');
      expect(query?.containsKey('from'), isTrue);
      expect(query?.containsKey('to'), isTrue);
    });

    test('без группы занятия не запрашиваются', () async {
      client.responses['GET /me/athletes'] = {
        'data': [athlete(id: 'athlete-1', firstName: 'Алия', isPrimary: true)],
      };
      // Спортсмен не числится ни в одной группе: 404 не должен ломать главную и
      // не должен показываться как ошибка.
      client.errors['GET /groups/by-athlete/athlete-1'] = const ApiException(
        code: 'NOT_FOUND',
        message: 'Группа не найдена',
        statusCode: 404,
      );
      client.responses['GET /news'] = {'data': <Map<String, dynamic>>[]};

      final controller = buildController(client);
      await controller.load('token');

      expect(controller.group, isNull);
      expect(controller.nextSession, isNull);
      expect(controller.error, isNull);
      expect(client.calls.contains('GET /training-sessions'), isFalse);
    });
  });

  group('посещаемость', () {
    test('берется строка выбранного спортсмена', () async {
      client.responses['GET /me/athletes'] = {
        'data': [athlete(id: 'athlete-1', firstName: 'Алия', isPrimary: true)],
      };
      client.responses['GET /groups/by-athlete/athlete-1'] = {
        'id': 'group-1',
        'name': 'Дети 7-9',
      };
      client.responses['GET /training-sessions'] = {'data': <Map<String, dynamic>>[]};
      client.responses['GET /attendance/summary'] = {
        'data': [
          {
            'athleteId': 'athlete-2',
            'total': 8,
            'present': 0,
            'absent': 8,
            'excused': 0,
            'unmarked': 0,
          },
          {
            'athleteId': 'athlete-1',
            'total': 8,
            'present': 6,
            'absent': 2,
            'excused': 0,
            'unmarked': 0,
          },
        ],
      };
      client.responses['GET /news'] = {'data': <Map<String, dynamic>>[]};

      final controller = buildController(client);
      await controller.load('token');

      expect(controller.attendance?.present, 6);
      expect(controller.attendance?.percent, 75);
    });

    test('без отметок процент не определен', () async {
      // «0%» здесь был бы неверным выводом: это не «не ходил», а «не отмечали».
      client.responses['GET /me/athletes'] = {
        'data': [athlete(id: 'athlete-1', firstName: 'Алия', isPrimary: true)],
      };
      client.responses['GET /groups/by-athlete/athlete-1'] = {
        'id': 'group-1',
        'name': 'Дети 7-9',
      };
      client.responses['GET /training-sessions'] = {'data': <Map<String, dynamic>>[]};
      client.responses['GET /attendance/summary'] = {
        'data': [
          {
            'athleteId': 'athlete-1',
            'total': 3,
            'present': 0,
            'absent': 0,
            'excused': 0,
            'unmarked': 3,
          },
        ],
      };
      client.responses['GET /news'] = {'data': <Map<String, dynamic>>[]};

      final controller = buildController(client);
      await controller.load('token');

      expect(controller.attendance?.marked, 0);
      expect(controller.attendance?.percent, isNull);
    });
  });

  group('объявления', () {
    test('закрепленное объявление важнее свежего', () async {
      client.responses['GET /me/athletes'] = {
        'data': [athlete(id: 'athlete-1', firstName: 'Алия', isPrimary: true)],
      };
      client.responses['GET /groups/by-athlete/athlete-1'] = {
        'id': 'group-1',
        'name': 'Дети 7-9',
      };
      client.responses['GET /training-sessions'] = {'data': <Map<String, dynamic>>[]};
      client.responses['GET /attendance/summary'] = {'data': <Map<String, dynamic>>[]};
      client.responses['GET /news'] = {
        'data': [
          {
            'id': 'fresh',
            'title': 'Свежее',
            'body': 'текст',
            'status': 'PUBLISHED',
            'author': {'id': 'u', 'firstName': 'А', 'lastName': 'Б'},
            'isPinned': false,
            'publishedAt': now.subtract(const Duration(hours: 1)).toIso8601String(),
            'archivedAt': null,
            'createdAt': now.toIso8601String(),
            'updatedAt': now.toIso8601String(),
            'commentsCount': 0,
            'canEdit': false,
          },
          {
            'id': 'pinned',
            'title': 'Важное',
            'body': 'текст',
            'status': 'PUBLISHED',
            'author': {'id': 'u', 'firstName': 'А', 'lastName': 'Б'},
            'isPinned': true,
            'publishedAt': now.subtract(const Duration(days: 5)).toIso8601String(),
            'archivedAt': null,
            'createdAt': now.toIso8601String(),
            'updatedAt': now.toIso8601String(),
            'commentsCount': 0,
            'canEdit': false,
          },
        ],
      };

      final controller = buildController(client);
      await controller.load('token');

      expect(controller.latestNews?.id, 'pinned');
    });
  });

  test('ошибка сети показывается понятным текстом', () async {
    client.errors['GET /me/athletes'] = const ApiException(
      code: 'NETWORK',
      message: 'Нет связи',
    );

    final controller = buildController(client);
    await controller.load('token');

    expect(controller.error, contains('Нет связи'));
    expect(controller.athletes, isEmpty);
  });
}
