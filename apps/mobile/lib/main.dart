import 'dart:async';

import 'package:flutter/material.dart';

import 'app.dart';
import 'core/api_client.dart';
import 'core/api_config.dart';
import 'core/token_storage.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/auth_repository.dart';

/// Точка входа приложения.
///
/// Зависимости собираются вручную: граф маленький (клиент, хранилище,
/// репозиторий, контроллер), и подключать DI-контейнер ради четырех объектов
/// означало бы усложнять запуск без выгоды.
void main() {
  WidgetsFlutterBinding.ensureInitialized();

  final config = ApiConfig.fromEnvironment();
  final controller = AuthController(
    repository: AuthRepository(
      client: HttpApiClient(config: config),
      storage: SecureTokenStorage(),
    ),
  );

  // Проверка сессии запускается до показа интерфейса: иначе у уже вошедшего
  // человека на мгновение мелькал бы экран входа.
  unawaited(controller.restore());

  runApp(OctagonApp(authController: controller));
}
