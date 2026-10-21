import 'package:octagon_mobile/core/token_storage.dart';

/// Хранилище токенов в памяти: тесты не должны трогать Keychain/Keystore.
class InMemoryTokenStorage implements TokenStorage {
  StoredTokens? _tokens;

  /// Сколько раз хранилище очищали: проверяется в тестах на выход и на
  /// недействительный refresh.
  int clearCount = 0;

  @override
  Future<StoredTokens?> read() async => _tokens;

  @override
  Future<void> write(StoredTokens tokens) async {
    _tokens = tokens;
  }

  @override
  Future<void> clear() async {
    _tokens = null;
    clearCount += 1;
  }
}
