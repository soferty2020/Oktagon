import '../../core/api_client.dart';
import '../schedule/schedule_models.dart';
import 'trainer_models.dart';

/// Данные тренера: группы, занятия и посещаемость.
///
/// Один репозиторий, а не четыре: все методы работают с одной предметной областью
/// (занятия своих групп), и разделение добавило бы файлов без пользы.
class TrainerRepository {
  TrainerRepository({required ApiClient client}) : _client = client;

  final ApiClient _client;

  /// Группы тренера.
  Future<List<TrainerGroup>> listGroups(String token) async {
    final response = await _client.getJson('/groups', token: token);

    final raw = response['data'] ?? response;
    if (raw is! List) {
      return const [];
    }

    return raw
        .whereType<Map<String, dynamic>>()
        .map(TrainerGroup.fromJson)
        .toList(growable: false);
  }

  /// Занятия по всем группам за период.
  ///
  /// Запросы идут параллельно: последовательные на четырех группах дали бы
  /// заметную задержку на мобильной сети.
  Future<List<TrainingSession>> listSessions({
    required String token,
    required List<String> groupIds,
    required DateTime from,
    required DateTime to,
  }) async {
    if (groupIds.isEmpty) {
      return const [];
    }

    final results = await Future.wait(
      groupIds.map(
        (groupId) => _client
            .getJson(
              '/training-sessions',
              token: token,
              query: {
                'groupId': groupId,
                'from': from.toUtc().toIso8601String(),
                'to': to.toUtc().toIso8601String(),
              },
            )
            .then((response) {
          final raw = response['data'] ?? response;
          if (raw is! List) {
            return <TrainingSession>[];
          }
          return raw
              .whereType<Map<String, dynamic>>()
              .map(TrainingSession.fromJson)
              .toList();
        }),
      ),
    );

    final all = results.expand((sessions) => sessions).toList()
      ..sort((left, right) => left.startsAt.compareTo(right.startsAt));
    return all;
  }

  /// Состав группы (`GET /groups/{id}`).
  ///
  /// Отдельный запрос на группу: отдельного «списка учеников тренера» в контракте
  /// нет, а состав нужен для экрана «Ученики» и для сводки.
  Future<List<RosterEntry>> groupMembers({
    required String token,
    required String groupId,
  }) async {
    final response = await _client.getJson('/groups/$groupId', token: token);

    final raw = response['members'];
    if (raw is! List) {
      return const [];
    }

    return raw
        .whereType<Map<String, dynamic>>()
        .map(
          (member) => RosterEntry(
            athleteId: member['athleteId'] as String,
            firstName: (member['firstName'] as String?) ?? '',
            lastName: (member['lastName'] as String?) ?? '',
            state: AttendanceState.none,
            plannedAbsenceReason: null,
          ),
        )
        .toList(growable: false);
  }

  /// Журнал занятия: состав и уже подтвержденные отметки.
  Future<SessionJournal> journal({
    required String token,
    required String sessionId,
  }) async {
    final response = await _client.getJson(
      '/training-sessions/$sessionId/attendance',
      token: token,
    );
    return SessionJournal.fromJson(response);
  }

  /// Сохранение отметок.
  ///
  /// Передаются только измененные спортсмены: тренер отмечает по ходу занятия, а
  /// не заполняет весь список. Отправка всех подряд перезаписала бы отметки,
  /// сделанные с другого устройства.
  Future<void> saveAttendance({
    required String token,
    required String sessionId,
    required Map<String, AttendanceState> marks,
  }) async {
    final payload = marks.entries
        .where((entry) => entry.value.apiValue != null)
        .map((entry) => {'athleteId': entry.key, 'status': entry.value.apiValue})
        .toList();

    if (payload.isEmpty) {
      return;
    }

    await _client.putJson(
      '/training-sessions/$sessionId/attendance',
      body: {'marks': payload},
      token: token,
    );
  }
}
