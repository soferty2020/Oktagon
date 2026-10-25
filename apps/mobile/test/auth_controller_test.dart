import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/core/api_exception.dart';
import 'package:octagon_mobile/features/auth/auth_controller.dart';
import 'package:octagon_mobile/features/auth/auth_repository.dart';

import 'support/fake_api_client.dart';
import 'support/in_memory_token_storage.dart';
import 'auth_repository_test.dart' show sessionResponse;

void main() {
  late FakeApiClient client;
  late AuthController controller;

  setUp(() {
    client = FakeApiClient();
    controller = AuthController(
      repository: AuthRepository(client: client, storage: InMemoryTokenStorage()),
    );
  });

  test('при запуске без токенов переходит к экрану входа', () async {
    expect(controller.status, AuthStatus.checking);

    await controller.restore();

    expect(controller.status, AuthStatus.unauthenticated);
    expect(controller.session, isNull);
  });

  test('успешный вход переводит в состояние авторизации', () async {
    client.responses['POST /auth/login'] = sessionResponse();

    final success = await controller.login(
      email: 'parent@octagon.local',
      password: 'secret-123',
    );

    expect(success, isTrue);
    expect(controller.status, AuthStatus.authenticated);
    expect(controller.user?.role, 'MEMBER');
    expect(controller.error, isNull);
    expect(controller.busy, isFalse);
  });

  test('неудачный вход оставляет на экране входа понятный текст', () async {
    client.errors['POST /auth/login'] = const ApiException(
      code: 'INVALID_CREDENTIALS',
      message: 'Неверная почта или пароль',
      statusCode: 401,
    );

    final success = await controller.login(email: 'parent@octagon.local', password: 'bad');

    expect(success, isFalse);
    expect(controller.status, AuthStatus.unauthenticated);
    // Текст свой, а не сообщение backend: пользователю нужнее действие.
    expect(controller.error, 'Неверная почта или пароль');
    expect(controller.busy, isFalse);
  });

  test('блокировка аккаунта объясняется отдельно', () async {
    client.errors['POST /auth/login'] = const ApiException(
      code: 'USER_BLOCKED',
      message: 'blocked',
      statusCode: 403,
    );

    await controller.login(email: 'parent@octagon.local', password: 'secret-123');

    expect(controller.error, contains('заблокирована'));
  });

  test('перебор паролей подсказывает подождать', () async {
    client.errors['POST /auth/login'] = const ApiException(
      code: 'TOO_MANY_REQUESTS',
      message: 'too many',
      statusCode: 429,
    );

    await controller.login(email: 'parent@octagon.local', password: 'secret-123');

    expect(controller.error, contains('Слишком много попыток'));
  });

  test('выход возвращает к экрану входа', () async {
    client.responses['POST /auth/login'] = sessionResponse();
    await controller.login(email: 'parent@octagon.local', password: 'secret-123');
    client.responses['POST /auth/logout'] = const {};

    await controller.logout();

    expect(controller.status, AuthStatus.unauthenticated);
    expect(controller.session, isNull);
  });

  test('слушатели уведомляются при смене состояния', () async {
    // Экран входа строится через ListenableBuilder: без уведомления он не
    // перерисовался бы после ответа сервера.
    var notifications = 0;
    controller.addListener(() => notifications += 1);
    client.responses['POST /auth/login'] = sessionResponse();

    await controller.login(email: 'parent@octagon.local', password: 'secret-123');

    expect(notifications, greaterThanOrEqualTo(2));
  });
}
