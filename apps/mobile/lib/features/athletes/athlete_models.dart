/// Спортсмен, связанный с аккаунтом (`GET /me/athletes`).
///
/// Поля повторяют контракт `LinkedAthlete`. Заметки клуба сюда не входят: они не
/// предназначены родителю.
class LinkedAthlete {
  const LinkedAthlete({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.middleName,
    required this.status,
    required this.relation,
    required this.isPrimary,
    required this.beltGrade,
    this.beltAwardedAt,
    this.rank,
    this.rankLabel,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String? middleName;

  /// `ACTIVE`, `FROZEN`, `ARCHIVED`.
  final String status;

  /// Текущий пояс (K3): код из справочника. Белый — значение по умолчанию.
  final String beltGrade;

  /// Дата присвоения пояса в формате `YYYY-MM-DD`.
  final String? beltAwardedAt;

  /// Ступень из каталога (ADR-0012): «8 кю», «2 дан». Пояс выводится из неё.
  final String? rank;

  /// Подпись ступени; `null`, если ступень не определена.
  final String? rankLabel;

  /// Связь с аккаунтом: `SELF`, `PARENT`, `GUARDIAN`.
  final String relation;

  /// Основной спортсмен: его карточка открывается по умолчанию.
  final bool isPrimary;

  String get displayName {
    final parts = [lastName, firstName, middleName]
        .where((part) => part != null && part.isNotEmpty)
        .cast<String>();
    return parts.join(' ');
  }

  bool get isActive => status == 'ACTIVE';

  factory LinkedAthlete.fromJson(Map<String, dynamic> json) {
    return LinkedAthlete(
      id: json['id'] as String,
      firstName: (json['firstName'] as String?) ?? '',
      lastName: (json['lastName'] as String?) ?? '',
      middleName: json['middleName'] as String?,
      status: (json['status'] as String?) ?? 'ACTIVE',
      relation: (json['relation'] as String?) ?? 'PARENT',
      isPrimary: json['isPrimary'] == true,
      beltGrade: (json['beltGrade'] as String?) ?? 'WHITE',
      beltAwardedAt: json['beltAwardedAt'] as String?,
      rank: json['rank'] as String?,
      rankLabel: json['rankLabel'] as String?,
    );
  }
}
