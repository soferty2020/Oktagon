import 'package:flutter/foundation.dart';

import '../../core/api_exception.dart';
import 'auth_models.dart';
import 'auth_repository.dart';

/// Состояние сессии в приложении.
enum AuthStatus {
  /// Проверяется сохраненная сессия при запуске.
  checking,

  /// Пользователь не вошел.
  unauthenticated,

  /// Пользователь вошел.
  authenticated,
}

/// Держит состояние входа и связывает экран с репозиторием.
///
/// `ChangeNotifier`, а не сторонний менеджер состояния: в приложении одно
/// глобальное состояние (сессия), и добавлять зависимость ради него означало бы
/// усложнять сборку без выгоды.
class AuthController extends ChangeNotifier {
  AuthController({required AuthRepository repository}) : _repository = repository;

  final AuthRepository _repository;

  AuthStatus _status = AuthStatus.checking;
  AuthSession? _session;
  String? _error;
  bool _busy = false;

  AuthStatus get status => _status;
  AuthSession? get session => _session;
  UserProfile? get user => _session?.user;

  /// Текст последней ошибки входа.
  String? get error => _error;

  /// Идет ли запрос (блокирует кнопку, чтобы не отправить форму дважды).
  bool get busy => _busy;

  /// Проверяет сохраненную сессию при запуске приложения.
  Future<void> restore() async {
    _status = AuthStatus.checking;
    notifyListeners();

    final restored = await _repository.restore();
    _session = restored;
    _status = restored == null ? AuthStatus.unauthenticated : AuthStatus.authenticated;
    notifyListeners();
  }

  /// Вход по email и паролю.
  Future<bool> login({required String email, required String password}) async {
    _busy = true;
    _error = null;
    notifyListeners();

    try {
      _session = await _repository.login(email: email, password: password);
      _status = AuthStatus.authenticated;
      return true;
    } on ApiException catch (error) {
      _error = describeAuthError(error);
      // Неудачная попытка входа — это состояние «не авторизован», а не
      // «проверяется»: иначе экран остался бы на заставке вместо формы.
      _status = AuthStatus.unauthenticated;
      return false;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// Выход из аккаунта.
  Future<void> logout() async {
    _busy = true;
    notifyListeners();

    await _repository.logout();

    _session = null;
    _status = AuthStatus.unauthenticated;
    _busy = false;
    notifyListeners();
  }
}

/// Текст ошибки входа для пользователя.
///
/// Основные случаи объясняются своими словами: «неверный пароль» и «нет связи»
/// требуют разных действий, и общий текст заставил бы человека перебирать
/// причины.
String describeAuthError(ApiException error) {
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return 'Неверный email или пароль';
    case 'USER_BLOCKED':
      return 'Учетная запись заблокирована. Обратитесь к администратору клуба.';
    case 'INVITE_INVALID':
      return 'Приглашение недействительно: попросите новое у администратора.';
    case 'TOO_MANY_REQUESTS':
      return 'Слишком много попыток входа. Подождите минуту и попробуйте снова.';
    case 'NETWORK':
      return error.message;
    case 'VALIDATION_FAILED':
      return 'Проверьте email и пароль: email должен быть адресом, пароль — не короче 8 символов.';
    default:
      return error.message;
  }
}
