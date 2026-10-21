import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/core/api_exception.dart';
import 'package:octagon_mobile/core/token_storage.dart';
import 'package:octagon_mobile/features/auth/auth_repository.dart';

import 'support/fake_api_client.dart';
import 'support/in_memory_token_storage.dart';

/// Ответ `/auth/login`, соответствующий контракту `AuthSession`.
Map<String, dynamic> sessionResponse({
  String accessToken = 'access-token',
  String refreshToken = 'refresh-token',
  int expiresIn = 900,
  List<String> permissions = const ['schedule.view', 'news.view'],
  String role = 'MEMBER',
}) {
  return {
    'accessToken': accessToken,
    'expiresIn': expiresIn,
    'refreshToken': refreshToken,
    'refreshExpiresAt': DateTime.now()
        .add(const Duration(days: 30))
        .toUtc()
        .toIso8601String(),
    'user': {
      'id': 'user-1',
      'email': 'parent@octagon.local',
      'firstName': 'Алия',
      'lastName': 'Серик',
      'role': role,
      'status': 'ACTIVE',
      'scopeAllGroups': false,
      'permissions': permissions,
    },
  };
}

void main() {
  late FakeApiClient client;
  late InMemoryTokenStorage storage;
  late AuthRepository repository;

  setUp(() {
    client = FakeApiClient();
    storage = InMemoryTokenStorage();
    repository = AuthRepository(client: client, storage: storage);
  });

  group('вход', () {
    test('сохраняет токены и профиль', () async {
      client.responses['POST /auth/login'] = sessionResponse();

      final session = await repository.login(
        email: ' parent@octagon.local ',
        password: 'secret-123',
      );

      expect(session.user.email, 'parent@octagon.local');
      expect(session.user.displayName, 'Алия Серик');
      expect(session.user.permissions, contains('schedule.view'));

      final stored = await storage.read();
      expect(stored?.accessToken, 'access-token');
      expect(stored?.refreshToken, 'refresh-token');
    });

    test('пробрасывает код ошибки для неверного пароля', () async {
      // Экран должен показать «неверный пароль», а не общий текст, поэтому
      // проверяется именно код контракта.
      client.errors['POST /auth/login'] = const ApiException(
        code: 'INVALID_CREDENTIALS',
        message: 'Неверный email или пароль',
        statusCode: 401,
      );

      await expectLater(
        repository.login(email: 'parent@octagon.local', password: 'wrong'),
        throwsA(
          isA<ApiException>().having((error) => error.code, 'code', 'INVALID_CREDENTIALS'),
        ),
      );

      expect(await storage.read(), isNull);
    });
  });

  group('восстановление сессии', () {
    test('без сохраненных токенов возвращает null', () async {
      expect(await repository.restore(), isNull);
      expect(client.calls, isEmpty);
    });

    test('с живым токеном забирает профиль заново', () async {
      await storage.write(
        StoredTokens(
          accessToken: 'live-token',
          refreshToken: 'refresh-token',
          accessExpiresAt: DateTime.now().add(const Duration(minutes: 10)),
        ),
      );
      client.responses['GET /me'] = {
        'id': 'user-1',
        'email': 'parent@octagon.local',
        'firstName': 'Алия',
        'lastName': 'Серик',
        'role': 'MEMBER',
        'status': 'ACTIVE',
        'scopeAllGroups': false,
        'permissions': ['schedule.view'],
      };

      final session = await repository.restore();

      expect(client.calls, ['GET /me']);
      expect(client.tokens, ['live-token']);
      expect(session?.user.firstName, 'Алия');
    });

    test('с истекшим токеном обновляет его', () async {
      await storage.write(
        StoredTokens(
          accessToken: 'expired-token',
          refreshToken: 'refresh-token',
          accessExpiresAt: DateTime.now().subtract(const Duration(minutes: 5)),
        ),
      );
      client.responses['POST /auth/refresh'] = sessionResponse(accessToken: 'new-token');

      final session = await repository.restore();

      // Истекший токен не используется для запроса профиля: сначала обновление.
      expect(client.calls, ['POST /auth/refresh']);
      expect(session?.accessToken, 'new-token');
      expect((await storage.read())?.accessToken, 'new-token');
    });

    test('отклоненный профиль вынуждает обновить токен', () async {
      // Токен жив по времени, но отозван на сервере: 401 должен привести к
      // попытке обновления, а не к выходу.
      await storage.write(
        StoredTokens(
          accessToken: 'revoked-token',
          refreshToken: 'refresh-token',
          accessExpiresAt: DateTime.now().add(const Duration(minutes: 10)),
        ),
      );
      client.errors['GET /me'] = const ApiException(
        code: 'UNAUTHENTICATED',
        message: 'Требуется вход',
        statusCode: 401,
      );
      client.responses['POST /auth/refresh'] = sessionResponse(accessToken: 'new-token');

      final session = await repository.restore();

      expect(client.calls, ['GET /me', 'POST /auth/refresh']);
      expect(session?.accessToken, 'new-token');
    });

    test('недействительный refresh очищает хранилище', () async {
      await storage.write(
        StoredTokens(
          accessToken: 'expired-token',
          refreshToken: 'old-refresh',
          accessExpiresAt: DateTime.now().subtract(const Duration(minutes: 5)),
        ),
      );
      client.errors['POST /auth/refresh'] = const ApiException(
        code: 'UNAUTHENTICATED',
        message: 'Сессия истекла',
        statusCode: 401,
      );

      final session = await repository.restore();

      expect(session, isNull);
      expect(await storage.read(), isNull);
      expect(storage.clearCount, greaterThan(0));
    });

    test('недоступный сервер не считается выходом из аккаунта', () async {
      // Сеть недоступна: токены валидны, и стирать их нельзя — иначе человек
      // остался бы разлогиненным из-за временного сбоя.
      await storage.write(
        StoredTokens(
          accessToken: 'live-token',
          refreshToken: 'refresh-token',
          accessExpiresAt: DateTime.now().add(const Duration(minutes: 10)),
        ),
      );
      client.errors['GET /me'] = const ApiException(
        code: 'NETWORK',
        message: 'Нет связи с сервером',
      );

      final session = await repository.restore();

      expect(session, isNull);
      expect(await storage.read(), isNotNull);
    });
  });

  test('выход отзывает токен и очищает хранилище', () async {
    await storage.write(
      StoredTokens(
        accessToken: 'live-token',
        refreshToken: 'refresh-token',
        accessExpiresAt: DateTime.now().add(const Duration(minutes: 10)),
      ),
    );
    client.responses['POST /auth/logout'] = const {};

    await repository.logout();

    expect(client.calls, ['POST /auth/logout']);
    expect(client.tokens, ['live-token']);
    expect(await storage.read(), isNull);
  });

  test('выход очищает хранилище даже при недоступном сервере', () async {
    await storage.write(
      StoredTokens(
        accessToken: 'live-token',
        refreshToken: 'refresh-token',
        accessExpiresAt: DateTime.now().add(const Duration(minutes: 10)),
      ),
    );
    client.errors['POST /auth/logout'] = const ApiException(
      code: 'NETWORK',
      message: 'Нет связи с сервером',
    );

    await repository.logout();

    expect(await storage.read(), isNull);
  });
}
