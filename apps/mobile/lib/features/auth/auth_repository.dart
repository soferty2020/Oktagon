import '../../core/api_client.dart';
import '../../core/api_exception.dart';
import '../../core/token_storage.dart';
import 'auth_models.dart';

/// Авторизация: вход, восстановление сессии, обновление токена, выход.
///
/// Репозиторий не знает про интерфейс: его задача — привести ответы API к
/// моделям и сохранить токены. Экран входа и состояние приложения живут отдельно,
/// поэтому логику можно тестировать без виджетов.
class AuthRepository {
  AuthRepository({required ApiClient client, required TokenStorage storage})
      : _client = client,
        _storage = storage;

  final ApiClient _client;
  final TokenStorage _storage;

  /// Вход по email и паролю.
  Future<AuthSession> login({required String email, required String password}) async {
    final response = await _client.postJson(
      '/auth/login',
      body: {'email': email.trim(), 'password': password},
    );

    final session = AuthSession.fromJson(response);
    await _storage.write(_toStored(session));
    return session;
  }

  /// Пробует восстановить сессию при запуске.
  ///
  /// Возвращает `null`, если сохраненных токенов нет или обновить их не удалось.
  /// Ошибки не пробрасываются: при запуске приложения недоступный сервер должен
  /// показывать экран входа, а не падение.
  Future<AuthSession?> restore() async {
    final stored = await _storage.read();
    if (stored == null) {
      return null;
    }

    // Токен еще жив: профиль запрашивается заново, потому что права могли
    // измениться, а в хранилище лежит только токен.
    if (stored.accessExpiresAt.isAfter(DateTime.now())) {
      try {
        final profile = await _client.getJson('/me', token: stored.accessToken);
        return _sessionFromStored(stored, UserProfile.fromJson(profile));
      } on ApiException catch (error) {
        // 401 — токен отозван раньше срока: пробуем обновить. Остальные ошибки
        // (сеть, 5xx) означают, что сервер недоступен, а не что сессия неверна.
        if (error.statusCode != 401) {
          return null;
        }
      }
    }

    return refresh(stored.refreshToken);
  }

  /// Обновляет access-токен по refresh-токену.
  Future<AuthSession?> refresh(String refreshToken) async {
    try {
      final response = await _client.postJson(
        '/auth/refresh',
        body: {'refreshToken': refreshToken},
      );

      final session = AuthSession.fromJson(response);
      await _storage.write(_toStored(session));
      return session;
    } on ApiException {
      // Refresh недействителен: сессии больше нет, токены нужно убрать, иначе
      // приложение будет бесконечно пытаться обновиться при каждом запуске.
      await _storage.clear();
      return null;
    }
  }

  /// Выход: отзывает refresh-токен на сервере и очищает хранилище.
  ///
  /// Очистка выполняется всегда: пользователь нажал «выйти», и оставлять токены
  /// на устройстве из-за недоступного сервера было бы неправильно.
  Future<void> logout() async {
    final stored = await _storage.read();
    try {
      if (stored != null) {
        await _client.postJson(
          '/auth/logout',
          body: {'refreshToken': stored.refreshToken},
          token: stored.accessToken,
        );
      }
    } on ApiException {
      // Отзыв не удался, но локальная сессия все равно очищается ниже.
    } finally {
      await _storage.clear();
    }
  }

  StoredTokens _toStored(AuthSession session) => StoredTokens(
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        accessExpiresAt: session.accessExpiresAt,
      );

  AuthSession _sessionFromStored(StoredTokens stored, UserProfile profile) => AuthSession(
        accessToken: stored.accessToken,
        refreshToken: stored.refreshToken,
        accessExpiresAt: stored.accessExpiresAt,
        user: profile,
      );
}
