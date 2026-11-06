/// Профиль пользователя из `GET /me`.
///
/// Поля повторяют контракт `UserProfile` (openapi.yaml). Секретов и внутренних
/// полей backend не отдает.
class UserProfile {
  const UserProfile({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.role,
    required this.permissions,
  });

  final String id;
  final String email;
  final String firstName;
  final String lastName;

  /// `MEMBER`, `STAFF` или `SUPERADMIN`.
  final String role;

  /// Действующие права. По ним строится навигация: приложение одно для всех
  /// ролей (docs/10-mobile-app.md), и разные роли видят разные разделы.
  final List<String> permissions;

  String get displayName => '$firstName $lastName'.trim();

  bool get isStaff => role == 'STAFF' || role == 'SUPERADMIN';

  bool hasPermission(String code) => permissions.contains(code);

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    final rawPermissions = json['permissions'];
    // API отдаёт объект `{codes: [...], grants: [...]}`, а не массив.
    // Без разбора `codes` список прав всегда был пустым, и в «Ещё»
    // оставались только разделы без требований — Чаты и Профиль.
    final List<String> permissions;
    if (rawPermissions is List) {
      permissions = rawPermissions.whereType<String>().toList(growable: false);
    } else if (rawPermissions is Map) {
      final codes = rawPermissions['codes'];
      permissions = codes is List
          ? codes.whereType<String>().toList(growable: false)
          : const [];
    } else {
      permissions = const [];
    }

    return UserProfile(
      id: json['id'] as String,
      email: json['email'] as String,
      firstName: (json['firstName'] as String?) ?? '',
      lastName: (json['lastName'] as String?) ?? '',
      role: (json['role'] as String?) ?? 'MEMBER',
      permissions: permissions,
    );
  }
}

/// Сессия: токены и профиль.
class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.accessExpiresAt,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;
  final DateTime accessExpiresAt;
  final UserProfile user;

  /// `AuthSession` из ответа `/auth/login` или `/auth/refresh`.
  ///
  /// `expiresIn` приходит в секундах; момент истечения вычисляется от текущего
  /// времени. Часы устройства могут расходиться с сервером, поэтому запас в
  /// минуту: иначе токен мог бы считаться живым, уже будучи отклоненным.
  factory AuthSession.fromJson(Map<String, dynamic> json) {
    final expiresIn = json['expiresIn'];
    final seconds = expiresIn is int ? expiresIn : int.tryParse('$expiresIn') ?? 0;
    final safetyMargin = Duration(seconds: seconds > 120 ? 60 : 0);

    return AuthSession(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      accessExpiresAt: DateTime.now().add(Duration(seconds: seconds) - safetyMargin),
      user: UserProfile.fromJson(json['user'] as Map<String, dynamic>),
    );
  }

  /// Сессия, восстановленная из хранилища, где профиля нет.
  AuthSession withUser(UserProfile profile) => AuthSession(
        accessToken: accessToken,
        refreshToken: refreshToken,
        accessExpiresAt: accessExpiresAt,
        user: profile,
      );
}
