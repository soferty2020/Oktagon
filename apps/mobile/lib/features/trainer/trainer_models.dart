/// Группа в зоне видимости тренера (`GET /groups`).
///
/// Для сотрудника сервер возвращает только назначенные группы (ADR-0006),
/// поэтому фильтровать на клиенте не нужно.
class TrainerGroup {
  const TrainerGroup({
    required this.id,
    required this.name,
    required this.activeMembersCount,
  });

  final String id;
  final String name;
  final int activeMembersCount;

  factory TrainerGroup.fromJson(Map<String, dynamic> json) {
    return TrainerGroup(
      id: json['id'] as String,
      name: (json['name'] as String?) ?? '',
      activeMembersCount: (json['activeMembersCount'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Отметка спортсмена на занятии.
enum AttendanceState {
  present,
  absent,
  excused,

  /// Отметки нет: тренер еще не подтверждал.
  none;

  static AttendanceState fromApi(String? value) {
    return switch (value) {
      'PRESENT' => AttendanceState.present,
      'ABSENT' => AttendanceState.absent,
      'EXCUSED' => AttendanceState.excused,
      _ => AttendanceState.none,
    };
  }

  String? get apiValue {
    return switch (this) {
      AttendanceState.present => 'PRESENT',
      AttendanceState.absent => 'ABSENT',
      AttendanceState.excused => 'EXCUSED',
      AttendanceState.none => null,
    };
  }
}

/// Спортсмен в журнале занятия.
class RosterEntry {
  const RosterEntry({
    required this.athleteId,
    required this.firstName,
    required this.lastName,
    required this.state,
    required this.plannedAbsenceReason,
  });

  final String athleteId;
  final String firstName;
  final String lastName;
  final AttendanceState state;

  /// Причина, о которой сообщил родитель (BR-008). Показывается тренеру, чтобы
  /// он понимал отсутствие до отметки.
  final String? plannedAbsenceReason;

  String get displayName => '$lastName $firstName'.trim();

  RosterEntry copyWith(AttendanceState state) => RosterEntry(
        athleteId: athleteId,
        firstName: firstName,
        lastName: lastName,
        state: state,
        plannedAbsenceReason: plannedAbsenceReason,
      );

  factory RosterEntry.fromJson(Map<String, dynamic> json) {
    final attendance = json['attendance'];
    final planned = json['plannedAbsence'];

    return RosterEntry(
      athleteId: json['athleteId'] as String,
      firstName: (json['firstName'] as String?) ?? '',
      lastName: (json['lastName'] as String?) ?? '',
      state: AttendanceState.fromApi(
        attendance is Map<String, dynamic> ? attendance['status'] as String? : null,
      ),
      plannedAbsenceReason:
          planned is Map<String, dynamic> ? planned['reason'] as String? : null,
    );
  }
}

/// Журнал занятия (`GET /training-sessions/{id}/attendance`).
class SessionJournal {
  const SessionJournal({
    required this.sessionId,
    required this.groupName,
    required this.startsAt,
    required this.roster,
    required this.markedCount,
  });

  final String sessionId;
  final String groupName;
  final DateTime startsAt;
  final List<RosterEntry> roster;
  final int markedCount;

  factory SessionJournal.fromJson(Map<String, dynamic> json) {
    final roster = json['roster'];
    return SessionJournal(
      sessionId: json['sessionId'] as String,
      groupName: (json['groupName'] as String?) ?? '',
      startsAt: DateTime.parse(json['startsAt'] as String).toLocal(),
      roster: roster is List
          ? roster
              .whereType<Map<String, dynamic>>()
              .map(RosterEntry.fromJson)
              .toList(growable: false)
          : const [],
      markedCount: (json['markedCount'] as num?)?.toInt() ?? 0,
    );
  }
}
