import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'api_exception.dart';

/// Клиент с продлением сессии.
///
/// Access-токен живёт 15 минут. Без продления приложение на телефоне
/// перестаёт грузить данные, пока человек не перезапустит его вручную:
/// каждый запрос получает 401, а экраны показывают «не удалось загрузить».
///
/// Обёртка перехватывает 401, один раз обновляет сессию и повторяет запрос с
/// новым токеном. Параллельные запросы ждут одно и то же обновление, чтобы не
/// устроить шторм из `/auth/refresh`.
class RefreshingApiClient implements ApiClient {
  RefreshingApiClient({
    required ApiClient inner,
    required Future<String?> Function() onRefresh,
  })  : _inner = inner,
        _onRefresh = onRefresh;

  final ApiClient _inner;
  final Future<String?> Function() _onRefresh;

  Future<String?>? _pendingRefresh;

  /// Обновление сессии, общее для всех ожидающих запросов.
  Future<String?> _refresh() {
    final pending = _pendingRefresh;
    if (pending != null) {
      return pending;
    }
    final future = _onRefresh().whenComplete(() => _pendingRefresh = null);
    _pendingRefresh = future;
    return future;
  }

  Future<Map<String, dynamic>> _run(
    Future<Map<String, dynamic>> Function(String? token) call,
    String? token,
  ) async {
    try {
      return await call(token);
    } on ApiException catch (error) {
      // Продлеваем только при явном 401 и только если запрос был с токеном:
      // на публичных маршрутах (вход, здоровье) продлевать нечего.
      if (error.statusCode != 401 || token == null) {
        rethrow;
      }
      final fresh = await _refresh();
      if (fresh == null || fresh == token) {
        rethrow;
      }
      return call(fresh);
    }
  }

  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    String? token,
    Map<String, String>? query,
  }) {
    return _run(
      (value) => _inner.getJson(path, token: value, query: query),
      token,
    );
  }

  @override
  Future<Map<String, dynamic>> postJson(
    String path, {
    Map<String, dynamic>? body,
    String? token,
  }) {
    return _run(
      (value) => _inner.postJson(path, body: body, token: value),
      token,
    );
  }

  @override
  Future<Map<String, dynamic>> putJson(
    String path, {
    Map<String, dynamic>? body,
    String? token,
  }) {
    return _run(
      (value) => _inner.putJson(path, body: body, token: value),
      token,
    );
  }

  @override
  Future<Map<String, dynamic>> patchJson(
    String path, {
    Map<String, dynamic>? body,
    String? token,
  }) {
    return _run(
      (value) => _inner.patchJson(path, body: body, token: value),
      token,
    );
  }

  @visibleForTesting
  void resetPendingRefreshForTest() => _pendingRefresh = null;
}
