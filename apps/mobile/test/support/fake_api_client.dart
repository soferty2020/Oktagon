import 'package:octagon_mobile/core/api_client.dart';
import 'package:octagon_mobile/core/api_exception.dart';

/// Фейковый клиент API для тестов: сеть не нужна, ответы задаются в тесте.
class FakeApiClient implements ApiClient {
  /// Ответы по ключу `METHOD путь`; запрос должен быть зарегистрирован.
  final Map<String, Map<String, dynamic>> responses = {};

  /// Ошибки по тому же ключу: проверяют обработку отказов.
  final Map<String, ApiException> errors = {};

  /// Журнал вызовов: позволяет проверить, что запрос действительно ушел.
  final List<String> calls = [];

  /// Токены, с которыми выполнялись запросы.
  final List<String?> tokens = [];

  /// Параметры строки запроса по каждому вызову.
  final List<Map<String, String>?> queries = [];

  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    String? token,
    Map<String, String>? query,
  }) {
    queries.add(query);
    return _respond('GET $path', token);
  }

  @override
  Future<Map<String, dynamic>> postJson(
    String path, {
    Map<String, dynamic>? body,
    String? token,
  }) {
    queries.add(null);
    return _respond('POST $path', token);
  }

  @override
  Future<Map<String, dynamic>> putJson(
    String path, {
    Map<String, dynamic>? body,
    String? token,
  }) {
    queries.add(null);
    return _respond('PUT $path', token);
  }

  @override
  Future<Map<String, dynamic>> patchJson(
    String path, {
    Map<String, dynamic>? body,
    String? token,
  }) {
    queries.add(null);
    return _respond('PATCH $path', token);
  }

  Future<Map<String, dynamic>> _respond(String call, String? token) async {
    calls.add(call);
    tokens.add(token);

    final error = errors[call];
    if (error != null) {
      throw error;
    }

    final response = responses[call];
    if (response == null) {
      throw StateError('Нет ответа для $call: тест должен его задать');
    }
    return response;
  }
}
