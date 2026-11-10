import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/core/api_exception.dart';
import 'package:octagon_mobile/features/groups/group_repository.dart';

import 'support/fake_api_client.dart';

/// #152: группа спортсмена парсится из реального контракта.
///
/// API отдаёт `ActiveMembershipView` — `groupId`, `groupName`, `membershipId`,
/// `joinedAt`. Модель читала `id`/`name`, поэтому действующее членство
/// считалось отсутствием группы, и у родителя не грузились расписание
/// и посещаемость.
void main() {
  late FakeApiClient client;
  late GroupRepository repository;

  setUp(() {
    client = FakeApiClient();
    repository = GroupRepository(client: client);
  });

  test('членство читается из groupId и groupName', () async {
    client.responses['GET /groups/by-athlete/athlete-1'] = {
      'membershipId': 'membership-1',
      'groupId': 'group-1',
      'groupName': 'Дети 7-9 лет',
      'joinedAt': '2026-09-01',
    };

    final group = await repository.currentForAthlete(
      token: 't',
      athleteId: 'athlete-1',
    );

    expect(group, isNotNull);
    expect(group!.id, 'group-1');
    expect(group.name, 'Дети 7-9 лет');
    expect(group.membershipId, 'membership-1');
  });

  test('старый формат id/name тоже читается', () async {
    client.responses['GET /groups/by-athlete/athlete-1'] = {
      'id': 'group-2',
      'name': 'Старшая',
    };

    final group = await repository.currentForAthlete(
      token: 't',
      athleteId: 'athlete-1',
    );

    expect(group!.id, 'group-2');
    expect(group.name, 'Старшая');
  });

  test('404 — это «нет группы», а не ошибка', () async {
    client.errors['GET /groups/by-athlete/athlete-1'] = const ApiException(
      code: 'GROUP_NOT_FOUND',
      message: 'Группа не найдена',
      statusCode: 404,
    );

    final group = await repository.currentForAthlete(
      token: 't',
      athleteId: 'athlete-1',
    );

    expect(group, isNull);
  });

  test('пустой ответ — тоже «нет группы»', () async {
    client.responses['GET /groups/by-athlete/athlete-1'] = {};

    final group = await repository.currentForAthlete(
      token: 't',
      athleteId: 'athlete-1',
    );

    expect(group, isNull);
  });

  test('ответ с пустым groupId не выдаётся за группу', () async {
    client.responses['GET /groups/by-athlete/athlete-1'] = {
      'membershipId': 'm-1',
      'groupId': '',
      'groupName': '',
    };

    final group = await repository.currentForAthlete(
      token: 't',
      athleteId: 'athlete-1',
    );

    expect(group, isNull);
  });

  test('401 пробрасывается: это не «нет группы»', () async {
    client.errors['GET /groups/by-athlete/athlete-1'] = const ApiException(
      code: 'UNAUTHORIZED',
      message: 'Сессия истекла',
      statusCode: 401,
    );

    await expectLater(
      repository.currentForAthlete(token: 't', athleteId: 'athlete-1'),
      throwsA(isA<ApiException>()),
    );
  });

  test('403 пробрасывается', () async {
    client.errors['GET /groups/by-athlete/athlete-1'] = const ApiException(
      code: 'FORBIDDEN',
      message: 'Нет доступа к спортсмену',
      statusCode: 403,
    );

    await expectLater(
      repository.currentForAthlete(token: 't', athleteId: 'athlete-1'),
      throwsA(isA<ApiException>()),
    );
  });

  test('500 пробрасывается', () async {
    client.errors['GET /groups/by-athlete/athlete-1'] = const ApiException(
      code: 'INTERNAL',
      message: 'Ошибка сервера',
      statusCode: 500,
    );

    await expectLater(
      repository.currentForAthlete(token: 't', athleteId: 'athlete-1'),
      throwsA(isA<ApiException>()),
    );
  });

  test('объект внутри data тоже читается', () async {
    client.responses['GET /groups/by-athlete/athlete-1'] = {
      'data': {
        'groupId': 'group-3',
        'groupName': 'Младшая',
      },
    };

    final group = await repository.currentForAthlete(
      token: 't',
      athleteId: 'athlete-1',
    );

    expect(group!.id, 'group-3');
    expect(group.name, 'Младшая');
  });

  test('переключение между детьми даёт разные группы', () async {
    client.responses['GET /groups/by-athlete/child-a'] = {
      'groupId': 'group-a',
      'groupName': 'Дети 5-7 лет',
    };
    client.responses['GET /groups/by-athlete/child-b'] = {
      'groupId': 'group-b',
      'groupName': 'Старшая',
    };

    final first = await repository.currentForAthlete(token: 't', athleteId: 'child-a');
    final second = await repository.currentForAthlete(token: 't', athleteId: 'child-b');

    expect(first!.id, 'group-a');
    expect(second!.id, 'group-b');
    expect(first.id, isNot(second.id));
  });
}
