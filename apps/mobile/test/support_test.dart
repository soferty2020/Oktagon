import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/core/token_storage.dart';

import 'support/fake_api_client.dart';
import 'support/in_memory_token_storage.dart';

void main() {
  test('фейковый клиент хранит порядок вызовов', () async {
    // Проверка самих тестовых двойников: если они ведут себя не так, как
    // ожидают тесты репозитория, падение будет выглядеть как ошибка кода.
    final client = FakeApiClient();
    client.responses['GET /me'] = const {'id': 'user-1'};

    await client.getJson('/me', token: 'token');
    await client.getJson('/me');

    expect(client.calls, ['GET /me', 'GET /me']);
    expect(client.tokens, ['token', null]);
  });

  test('хранилище в памяти сохраняет и очищает токены', () async {
    final storage = InMemoryTokenStorage();
    await storage.write(
      StoredTokens(
        accessToken: 'access',
        refreshToken: 'refresh',
        accessExpiresAt: DateTime.utc(2026, 1, 1),
      ),
    );

    expect((await storage.read())?.refreshToken, 'refresh');

    await storage.clear();

    expect(await storage.read(), isNull);
    expect(storage.clearCount, 1);
  });
}
