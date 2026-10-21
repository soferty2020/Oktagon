import 'package:octagon_mobile/core/api_client.dart';
import 'package:octagon_mobile/core/api_exception.dart';

/// Фейковый клиент API для тестов: сеть не нужна, ответы задаются в тесте.
class FakeApiClient implements ApiClient {
  FakeApiClient();

  /// Ответы по пути; запрос method+path должен быть зарегистрирован.
  final Map<String, Map<String, dynamic>> responses = {};

  /// Ошибки по пути: используются, чтобы проверить обработку отказов.
  final Map<String, ApiException> errors = {};

  /// Журнал вызовов: позволяет проверить, что запрос действительно ушел.
  final List<String> calls = [];

  /// Токены, с которыми выполнялись запросы.
  final List<String?> tokens = [];

  @override
  Future<Map<String, dynamic>> getJson(String path, {String? token}) {
    return _respond('GET $path', path, token);
  }

  @override
  Future<Map<String, dynamic>> postJson(
    String path, {
    Map<String, dynamic>? body,
    String? token,
  }) {
    return _respond('POST $path', path, token);
  }

  Future<Map<String, dynamic>> _respond(String call, String path, String? token) async {
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
