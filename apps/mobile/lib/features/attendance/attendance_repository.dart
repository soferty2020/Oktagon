import '../../core/api_client.dart';

/// Посещаемость одного спортсмена за период.
class AthleteAttendance {
  const AthleteAttendance({
    required this.total,
    required this.present,
    required this.absent,
    required this.excused,
    required this.unmarked,
  });

  /// Всего занятий, где спортсмен числился в составе.
  final int total;
  final int present;
  final int absent;
  final int excused;

  /// Занятия без подтвержденной отметки.
  final int unmarked;

  /// Занятия с отметкой: по ним считается процент.
  int get marked => total - unmarked;

  /// Процент посещаемости от отмеченных занятий.
  ///
  /// `null`, если отмеченных нет: «0%» здесь был бы неверным выводом, это не
  /// «не ходил», а «не отмечали».
  int? get percent {
    if (marked <= 0) {
      return null;
    }
    return (present / marked * 100).round();
  }

  factory AthleteAttendance.fromJson(Map<String, dynamic> json) {
    int read(String key) => (json[key] as num?)?.toInt() ?? 0;
    return AthleteAttendance(
      total: read('total'),
      present: read('present'),
      absent: read('absent'),
      excused: read('excused'),
      unmarked: read('unmarked'),
    );
  }
}

/// Отметка на конкретном занятии (H5).
enum AttendanceRecordStatus {
  present,
  absent,
  excused;

  static AttendanceRecordStatus fromApi(String? value) {
    return switch (value) {
      'ABSENT' => AttendanceRecordStatus.absent,
      'EXCUSED' => AttendanceRecordStatus.excused,
      _ => AttendanceRecordStatus.present,
    };
  }

  String get label {
    return switch (this) {
      AttendanceRecordStatus.present => 'Был',
      AttendanceRecordStatus.absent => 'Не был',
      AttendanceRecordStatus.excused => 'Уважительная',
    };
  }
}

/// Запись истории посещений.
class AttendanceRecord {
  const AttendanceRecord({
    required this.sessionId,
    required this.groupName,
    required this.startsAt,
    required this.status,
    required this.comment,
  });

  final String sessionId;
  final String groupName;
  final DateTime startsAt;
  final AttendanceRecordStatus status;

  /// Комментарий тренера к отметке.
  final String? comment;

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    return AttendanceRecord(
      sessionId: json['sessionId'] as String,
      groupName: (json['groupName'] as String?) ?? '',
      startsAt: DateTime.parse(json['startsAt'] as String).toLocal(),
      status: AttendanceRecordStatus.fromApi(json['status'] as String?),
      comment: json['comment'] as String?,
    );
  }
}

/// Сводка посещаемости группы (`GET /attendance/summary`) и история отметок.
class AttendanceRepository {
  AttendanceRepository({required ApiClient client}) : _client = client;

  final ApiClient _client;

  /// Посещаемость спортсмена в группе за период.
  ///
  /// API считает по всей группе; нужная строка выбирается по `athleteId`.
  /// Это не лишняя работа: сводка по группе нужна и в админке, а отдельного
  /// метода «по спортсмену» в контракте нет.
  Future<AthleteAttendance?> forAthlete({
    required String token,
    required String groupId,
    required String athleteId,
    required DateTime from,
    required DateTime to,
  }) async {
    final response = await _client.getJson(
      '/attendance/summary',
      token: token,
      query: {
        'groupId': groupId,
        'from': from.toUtc().toIso8601String(),
        'to': to.toUtc().toIso8601String(),
      },
    );

    final raw = response['data'] ?? response;
    if (raw is! List) {
      return null;
    }

    for (final row in raw.whereType<Map<String, dynamic>>()) {
      if (row['athleteId'] == athleteId) {
        return AthleteAttendance.fromJson(row);
      }
    }
    return null;
  }

  /// История посещений спортсмена за период (H5).
  ///
  /// Отвечает на вопрос «был ли ребенок 12 ноября», на который сводка не отвечает:
  /// она отдает только суммы.
  Future<List<AttendanceRecord>> history({
    required String token,
    required String athleteId,
    required DateTime from,
    required DateTime to,
  }) async {
    final response = await _client.getJson(
      '/attendance/athletes/$athleteId',
      token: token,
      query: {
        'from': from.toUtc().toIso8601String(),
        'to': to.toUtc().toIso8601String(),
      },
    );

    final raw = response['data'] ?? response;
    if (raw is! List) {
      return const [];
    }

    return raw
        .whereType<Map<String, dynamic>>()
        .map(AttendanceRecord.fromJson)
        .toList(growable: false);
  }

  /// Предупредить клуб о планируемом отсутствии (BR-008).
  ///
  /// Отправляется на конкретное занятие: предупреждение — намерение родителя, а
  /// не факт, и тренер подтверждает итог отметкой.
  Future<void> reportAbsence({
    required String token,
    required String sessionId,
    required String athleteId,
    String? reason,
  }) async {
    await _client.postJson(
      '/training-sessions/$sessionId/attendance/planned-absence',
      body: {
        'athleteId': athleteId,
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      },
      token: token,
    );
  }
}
