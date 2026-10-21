import '../../core/api_client.dart';
import '../../core/api_exception.dart';

/// Группа спортсмена (`GET /groups/by-athlete/{athleteId}`).
class GroupSummary {
  const GroupSummary({required this.id, required this.name});

  final String id;
  final String name;

  factory GroupSummary.fromJson(Map<String, dynamic> json) {
    return GroupSummary(
      id: json['id'] as String,
      name: (json['name'] as String?) ?? '',
    );
  }
}

/// Действующая группа спортсмена.
///
/// Отдельный репозиторий, хотя запрос один: главная собирает данные из четырех
/// источников, и держать их в одном классе значило бы смешивать ответственность
/// расписания, посещаемости и групп.
class GroupRepository {
  GroupRepository({required ApiClient client}) : _client = client;

  final ApiClient _client;

  /// Группа или `null`, если спортсмен не числится ни в одной.
  ///
  /// 404 здесь — нормальное состояние, а не ошибка: новый спортсмен может быть
  /// заведен до распределения в группу. Если пробросить его наверх, главная
  /// покажет «ошибка» вместо понятного «группа не назначена».
  Future<GroupSummary?> currentForAthlete({
    required String token,
    required String athleteId,
  }) async {
    try {
      final response = await _client.getJson('/groups/by-athlete/$athleteId', token: token);
      if (response.isEmpty || response['id'] == null) {
        return null;
      }
      return GroupSummary.fromJson(response);
    } on ApiException catch (error) {
      if (error.statusCode == 404 || error.code == 'GROUP_NOT_FOUND') {
        return null;
      }
      rethrow;
    }
  }
}
