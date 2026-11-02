/// Настройки подключения к backend API.
///
/// Базовый адрес задается при сборке через `--dart-define`:
///   flutter run --dart-define=API_BASE_URL=https://api.example.com/api/v1
///
/// Значение по умолчанию рассчитано на эмулятор Android: `10.0.2.2` — это адрес
/// хост-машины из эмулятора. `localhost` там указывает на сам эмулятор, и запрос
/// ушел бы в никуда — самая частая потеря времени при первом запуске.
///
/// В release-сборке дефолта нет: без `--dart-define` приложение должно упасть с
/// понятной ошибкой конфигурации, а не ходить по http на адрес эмулятора (#55, M-3).
library;

import 'package:flutter/foundation.dart';

class ApiConfig {
  const ApiConfig({required this.baseUrl});

  /// Адрес API вместе с префиксом (`/api/v1`).
  final String baseUrl;

  static const String _defaultBaseUrl = 'http://10.0.2.2:3000/api/v1';

  /// Конфигурация из переменных сборки.
  factory ApiConfig.fromEnvironment() {
    const configured = String.fromEnvironment('API_BASE_URL');

    if (configured.isEmpty && kReleaseMode) {
      throw StateError(
        'Сборка без адреса API: передайте '
        '--dart-define=API_BASE_URL=https://<host>/api/v1',
      );
    }

    return ApiConfig(baseUrl: configured.isEmpty ? _defaultBaseUrl : configured);
  }

  /// Полный адрес метода API.
  Uri resolve(String path, [Map<String, String>? query]) {
    final normalized = path.startsWith('/') ? path.substring(1) : path;
    final uri = Uri.parse('$baseUrl/$normalized');
    if (query == null || query.isEmpty) {
      return uri;
    }
    return uri.replace(queryParameters: {...uri.queryParameters, ...query});
  }
}
