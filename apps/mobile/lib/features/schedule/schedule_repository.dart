import '../../core/api_client.dart';
import 'schedule_models.dart';

/// Занятия группы.
///
/// API отдает период целиком, а «ближайшее занятие» — это выбор из списка на
/// клиенте: сервер не знает, какое занятие считать ближайшим для конкретного
/// человека (могло начаться, могло быть отменено).
class ScheduleRepository {
  ScheduleRepository({required ApiClient client}) : _client = client;

  final ApiClient _client;

  /// Занятия группы за период.
  Future<List<TrainingSession>> listForGroup({
    required String token,
    required String groupId,
    required DateTime from,
    required DateTime to,
  }) async {
    final response = await _client.getJson(
      '/training-sessions',
      token: token,
      query: {
        'groupId': groupId,
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
        .map(TrainingSession.fromJson)
        .toList(growable: false);
  }
}
