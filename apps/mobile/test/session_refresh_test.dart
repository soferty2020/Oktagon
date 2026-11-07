import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/core/api_client.dart';
import 'package:octagon_mobile/core/api_exception.dart';
import 'package:octagon_mobile/core/refreshing_api_client.dart';

/// Клиент, который отвечает по сценарию: старый токен — 401, новый — данные.
class _ScriptedClient implements ApiClient {
  _ScriptedClient({this.rejectToken = 'stale'});

  final String rejectToken;
  int calls = 0;
  final List<String?> tokens = [];

  Future<Map<String, dynamic>> _answer(String? token) async {
    calls++;
    tokens.add(token);
    if (token == rejectToken) {
      throw const ApiException(
        code: 'UNAUTHORIZED',
        message: 'Сессия истекла',
        statusCode: 401,
      );
    }
    return {'ok': true, 'token': token};
  }

  @override
  Future<Map<String, dynamic>> getJson(String path,
          {String? token, Map<String, String>? query}) =>
      _answer(token);

  @override
  Future<Map<String, dynamic>> postJson(String path,
          {Map<String, dynamic>? body, String? token}) =>
      _answer(token);

  @override
  Future<Map<String, dynamic>> putJson(String path,
          {Map<String, dynamic>? body, String? token}) =>
      _answer(token);

  @override
  Future<Map<String, dynamic>> patchJson(String path,
          {Map<String, dynamic>? body, String? token}) =>
      _answer(token);
}

void main() {
  test('401 продлевает сессию и повторяет запрос с новым токеном', () async {
    final inner = _ScriptedClient();
    var refreshes = 0;
    final client = RefreshingApiClient(
      inner: inner,
      onRefresh: () async {
        refreshes++;
        return 'fresh';
      },
    );

    final result = await client.getJson('/athletes', token: 'stale');

    expect(result['ok'], isTrue);
    expect(result['token'], 'fresh');
    expect(refreshes, 1);
    expect(inner.tokens, ['stale', 'fresh']);
  });

  test('без токена 401 не продлевает: продлевать нечего', () async {
    final inner = _ScriptedClient(rejectToken: '__none__');
    // Запрос без токена: сервер отвечает 401 и на публичном маршруте.
    final anonymous = _AnonymousClient();
    var refreshes = 0;
    final client = RefreshingApiClient(
      inner: inner,
      onRefresh: () async {
        refreshes++;
        return 'fresh';
      },
    );

    final publicClient = RefreshingApiClient(
      inner: anonymous,
      onRefresh: () async {
        refreshes++;
        return 'fresh';
      },
    );
    await expectLater(
      publicClient.getJson('/health'),
      throwsA(isA<ApiException>()),
    );
    expect(refreshes, 0);
  });

  test('если refresh не удался, ошибка уходит вызывающему коду', () async {
    final inner = _ScriptedClient();
    final client = RefreshingApiClient(
      inner: inner,
      onRefresh: () async => null,
    );

    await expectLater(
      client.getJson('/athletes', token: 'stale'),
      throwsA(isA<ApiException>()),
    );
  });

  test('несколько параллельных 401 дают одно обновление', () async {
    final inner = _ScriptedClient();
    var refreshes = 0;
    final client = RefreshingApiClient(
      inner: inner,
      onRefresh: () async {
        refreshes++;
        await Future<void>.delayed(const Duration(milliseconds: 10));
        return 'fresh';
      },
    );

    final results = await Future.wait([
      client.getJson('/a', token: 'stale'),
      client.getJson('/b', token: 'stale'),
      client.getJson('/c', token: 'stale'),
    ]);

    expect(results.every((r) => r['token'] == 'fresh'), isTrue);
    expect(refreshes, 1);
  });

  test('успешный запрос не трогает refresh', () async {
    final inner = _ScriptedClient(rejectToken: 'never');
    var refreshes = 0;
    final client = RefreshingApiClient(
      inner: inner,
      onRefresh: () async {
        refreshes++;
        return 'fresh';
      },
    );

    await client.getJson('/athletes', token: 'good');
    expect(refreshes, 0);
  });
}
/// Клиент, который всегда отвечает 401 — как просроченная сессия.
class _AnonymousClient implements ApiClient {
  Future<Map<String, dynamic>> _deny() async => throw const ApiException(
        code: 'UNAUTHORIZED',
        message: 'Сессия истекла',
        statusCode: 401,
      );

  @override
  Future<Map<String, dynamic>> getJson(String path,
          {String? token, Map<String, String>? query}) =>
      _deny();

  @override
  Future<Map<String, dynamic>> postJson(String path,
          {Map<String, dynamic>? body, String? token}) =>
      _deny();

  @override
  Future<Map<String, dynamic>> putJson(String path,
          {Map<String, dynamic>? body, String? token}) =>
      _deny();

  @override
  Future<Map<String, dynamic>> patchJson(String path,
          {Map<String, dynamic>? body, String? token}) =>
      _deny();
}