import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_config.dart';
import 'api_exception.dart';

/// Абстракция HTTP-клиента.
///
/// Интерфейс, а не прямой `http.Client`, потому что репозитории должны
/// тестироваться без сети: тест на «неверный пароль» не должен зависеть от
/// запущенного backend.
abstract class ApiClient {
  Future<Map<String, dynamic>> getJson(String path, {String? token});

  Future<Map<String, dynamic>> postJson(
    String path, {
    Map<String, dynamic>? body,
    String? token,
  });
}

/// HTTP-клиент поверх пакета `http`.
class HttpApiClient implements ApiClient {
  HttpApiClient({
    required this.config,
    http.Client? client,
    this.timeout = const Duration(seconds: 20),
  }) : _client = client ?? http.Client();

  final ApiConfig config;
  final http.Client _client;

  /// Таймаут запроса. Без него при недоступном сервере экран «висел» бы
  /// бесконечно, и человек не понимал бы, ждать ему или закрывать приложение.
  final Duration timeout;

  @override
  Future<Map<String, dynamic>> getJson(String path, {String? token}) {
    return _send(path, method: 'GET', token: token);
  }

  @override
  Future<Map<String, dynamic>> postJson(
    String path, {
    Map<String, dynamic>? body,
    String? token,
  }) {
    return _send(path, method: 'POST', body: body, token: token);
  }

  Future<Map<String, dynamic>> _send(
    String path, {
    required String method,
    Map<String, dynamic>? body,
    String? token,
  }) async {
    final uri = config.resolve(path);
    final headers = <String, String>{
      'accept': 'application/json',
      if (body != null) 'content-type': 'application/json',
      if (token != null) 'authorization': 'Bearer $token',
    };

    try {
      final response = await switch (method) {
        'GET' => _client.get(uri, headers: headers),
        _ => _client.post(uri, headers: headers, body: jsonEncode(body ?? const {})),
      }
          .timeout(timeout);

      return _decode(response);
    } on TimeoutException {
      throw const ApiException(
        code: 'NETWORK',
        message: 'Сервер не ответил вовремя. Проверьте соединение.',
      );
    } on http.ClientException {
      throw const ApiException(
        code: 'NETWORK',
        message: 'Нет связи с сервером. Проверьте соединение.',
      );
    }
  }

  Map<String, dynamic> _decode(http.Response response) {
    final text = utf8.decode(response.bodyBytes);

    // 204 и пустое тело — валидный успешный ответ без данных.
    if (text.trim().isEmpty) {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return const {};
      }
      throw ApiException(
        code: 'UNKNOWN',
        message: 'Пустой ответ сервера (${response.statusCode})',
        statusCode: response.statusCode,
      );
    }

    final Object? decoded;
    try {
      decoded = jsonDecode(text);
    } on FormatException {
      throw ApiException(
        code: 'UNKNOWN',
        message: 'Сервер вернул неожиданный ответ',
        statusCode: response.statusCode,
      );
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
      // Список или скаляр в успешном ответе: оборачивается, чтобы вызывающий код
      // работал с единым типом.
      return {'data': decoded};
    }

    final errorCode = decoded is Map<String, dynamic> ? decoded['code'] : null;
    final errorMessage = decoded is Map<String, dynamic> ? decoded['message'] : null;

    throw ApiException(
      code: errorCode is String ? errorCode : 'UNKNOWN',
      message: errorMessage is String && errorMessage.isNotEmpty
          ? errorMessage
          : 'Ошибка сервера (${response.statusCode})',
      statusCode: response.statusCode,
    );
  }
}
