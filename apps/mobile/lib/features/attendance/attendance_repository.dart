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

/// Сводка посещаемости группы (`GET /attendance/summary`).
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
}
