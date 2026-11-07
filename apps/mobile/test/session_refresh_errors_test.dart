import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/core/api_exception.dart';
import 'package:octagon_mobile/core/refreshing_api_client.dart';
import 'package:octagon_mobile/core/token_storage.dart';
import 'package:octagon_mobile/features/auth/auth_repository.dart';

import 'support/fake_api_client.dart';
import 'support/in_memory_token_storage.dart';

/// Продление сессии не должно разлогинивать при временных сбоях.
///
/// Раньше любой `ApiException` в `/auth/refresh` стирал токены: метро, таймаут
/// или 502 — и человек оказывался на экране входа. Теперь токены удаляются
/// только при подтверждённой недействительности сессии.
void main() {
  Future<(AuthRepository, InMemoryTokenStorage, FakeApiClient)> build() async {
    final client = FakeApiClient();
    final storage = InMemoryTokenStorage();
    await storage.write(
      StoredTokens(
        accessToken: 'access',
        refreshToken: 'refresh',
        accessExpiresAt: DateTime.now().add(const Duration(minutes: 15)),
      ),
    );
    return (AuthRepository(client: client, storage: storage), storage, client);
  }

  test('сетевая ошибка при refresh не стирает сессию', () async {
    final (repository, storage, client) = await build();
    client.errors['POST /auth/refresh'] = const ApiException(
      code: 'NETWORK',
      message: 'Сервер недоступен',
    );

    await expectLater(repository.refresh('refresh'), throwsA(isA<ApiException>()));
    expect(await storage.read(), isNotNull,
        reason: 'токены должны остаться: сервер просто недоступен');
  });

  test('5xx при refresh не стирает сессию', () async {
    final (repository, storage, client) = await build();
    client.errors['POST /auth/refresh'] = const ApiException(
      code: 'INTERNAL',
      message: 'Ошибка сервера',
      statusCode: 502,
    );

    await expectLater(repository.refresh('refresh'), throwsA(isA<ApiException>()));
    expect(await storage.read(), isNotNull);
  });

  test('подтверждённый 401 при refresh стирает сессию', () async {
    final (repository, storage, client) = await build();
    client.errors['POST /auth/refresh'] = const ApiException(
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Сессия истекла',
      statusCode: 401,
    );

    final result = await repository.refresh('refresh');
    expect(result, isNull);
    expect(await storage.read(), isNull,
        reason: 'сессия недействительна — токены нужно убрать');
  });

  test('успешный refresh сохраняет новую сессию', () async {
    final (repository, storage, client) = await build();
    client.responses['POST /auth/refresh'] = {
      'accessToken': 'access-2',
      'refreshToken': 'refresh-2',
      'accessExpiresAt':
          DateTime.now().add(const Duration(minutes: 15)).toIso8601String(),
      'user': {
        'id': 'u1',
        'email': 'owner@octagon.local',
        'firstName': 'Владелец',
        'lastName': 'Клуба',
        'role': 'SUPERADMIN',
        'permissions': <String>[],
      },
    };

    final result = await repository.refresh('refresh');
    expect(result?.accessToken, 'access-2');
    final stored = await storage.read();
    expect(stored?.accessToken, 'access-2');
  });

  test('обрыв сети при продлении отдаёт исходную 401, а не ошибку refresh',
      () async {
    final inner = FakeApiClient();
    inner.errors['GET /athletes'] = const ApiException(
      code: 'UNAUTHORIZED',
      message: 'Сессия истекла',
      statusCode: 401,
    );
    final client = RefreshingApiClient(
      inner: inner,
      onRefresh: () async => throw const ApiException(
        code: 'NETWORK',
        message: 'Сервер недоступен',
      ),
    );

    await expectLater(
      client.getJson('/athletes', token: 'stale'),
      throwsA(
        isA<ApiException>()
            .having((e) => e.statusCode, 'statusCode', 401)
            .having((e) => e.code, 'code', 'UNAUTHORIZED'),
      ),
    );
  });
}
