import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Хранилище токенов сессии.
///
/// Интерфейс, а не сразу плагин: тесты не должны требовать нативного хранилища,
/// а в будущем может появиться другой способ хранения (например, биометрия).
abstract class TokenStorage {
  Future<StoredTokens?> read();

  Future<void> write(StoredTokens tokens);

  Future<void> clear();
}

/// Токены, сохраненные на устройстве.
class StoredTokens {
  const StoredTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.accessExpiresAt,
  });

  final String accessToken;
  final String refreshToken;

  /// Момент истечения access-токена. Нужен, чтобы не делать заведомо
  /// отклоненный запрос: истекший токен обновляется заранее.
  final DateTime accessExpiresAt;
}

/// Хранилище в защищенном хранилище платформы (Keychain на iOS, Keystore на
/// Android).
///
/// Токены дают доступ к данным клуба, поэтому SharedPreferences не подходит: там
/// данные лежат открытым текстом и попадают в резервные копии.
class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  final FlutterSecureStorage _storage;

  static const _accessKey = 'auth.access_token';
  static const _refreshKey = 'auth.refresh_token';
  static const _expiresKey = 'auth.access_expires_at';

  @override
  Future<StoredTokens?> read() async {
    final access = await _storage.read(key: _accessKey);
    final refresh = await _storage.read(key: _refreshKey);
    final expires = await _storage.read(key: _expiresKey);

    if (access == null || refresh == null || expires == null) {
      return null;
    }

    final expiresAt = DateTime.tryParse(expires);
    if (expiresAt == null) {
      // Испорченное значение: надежнее начать с чистого состояния, чем падать
      // при каждом запуске.
      await clear();
      return null;
    }

    return StoredTokens(
      accessToken: access,
      refreshToken: refresh,
      accessExpiresAt: expiresAt,
    );
  }

  @override
  Future<void> write(StoredTokens tokens) async {
    await _storage.write(key: _accessKey, value: tokens.accessToken);
    await _storage.write(key: _refreshKey, value: tokens.refreshToken);
    await _storage.write(
      key: _expiresKey,
      value: tokens.accessExpiresAt.toUtc().toIso8601String(),
    );
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
    await _storage.delete(key: _expiresKey);
  }
}
