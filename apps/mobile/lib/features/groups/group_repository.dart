import '../../core/api_client.dart';
import '../../core/api_exception.dart';

/// Группа спортсмена (`GET /groups/by-athlete/{athleteId}`).
///
/// Контракт `ActiveMembershipView` (packages/contracts/src/groups.ts):
/// `membershipId`, `groupId`, `groupName`, `joinedAt`. Раньше модель читала
/// `id`/`name`, которых в ответе нет, поэтому действующее членство считалось
/// отсутствием группы — расписание и посещаемость у родителя оставались
/// пустыми (#152).
class GroupSummary {
  const GroupSummary({
    required this.id,
    required this.name,
    this.membershipId,
    this.joinedAt,
  });

  /// `groupId` из ответа API.
  final String id;
  final String name;
  final String? membershipId;
  final String? joinedAt;

  factory GroupSummary.fromJson(Map<String, dynamic> json) {
    return GroupSummary(
      id: (json['groupId'] as String?) ?? (json['id'] as String?) ?? '',
      name: (json['groupName'] as String?) ?? (json['name'] as String?) ?? '',
      membershipId: json['membershipId'] as String?,
      joinedAt: json['joinedAt'] as String?,
    );
  }

  /// Ответ содержит группу. Пустой `groupId` означает «не числится».
  bool get isValid => id.isNotEmpty;
}

/// Действующая группа спортсмена.
///
/// Отдельный репозиторий, хотя запрос один: главная собирает данные из четырёх
/// источников, и держать их в одном классе значило бы смешивать ответственность
/// расписания, посещаемости и групп.
class GroupRepository {
  GroupRepository({required ApiClient client}) : _client = client;

  final ApiClient _client;

  /// Группа или `null`, если спортсмен не числится ни в одной.
  ///
  /// 404 здесь — нормальное состояние, а не ошибка: новый спортсмен может быть
  /// заведён до распределения в группу. Если пробросить его наверх, главная
  /// покажет «ошибка» вместо понятного «группа не назначена».
  Future<GroupSummary?> currentForAthlete({
    required String token,
    required String athleteId,
  }) async {
    try {
      final response = await _client.getJson('/groups/by-athlete/$athleteId', token: token);
      if (response.isEmpty) {
        return null;
      }
      // API может прислать объект напрямую или обернуть его в `data`.
      final payload = response['data'];
      if (payload == null && !response.containsKey('groupId') && !response.containsKey('id')) {
        return null;
      }
      final merged = payload is Map<String, dynamic> ? payload : response;
      final group = GroupSummary.fromJson(merged);
      return group.isValid ? group : null;
    } on ApiException catch (error) {
      if (error.statusCode == 404 || error.code == 'GROUP_NOT_FOUND') {
        return null;
      }
      rethrow;
    }
  }
}
