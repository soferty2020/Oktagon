import '../../core/api_client.dart';
import 'athlete_models.dart';

/// Спортсмены, доступные текущему аккаунту.
///
/// `GET /me/athletes` отдает только связанные карточки: родитель видит своих
/// детей, сам спортсмен — себя (ADR-0006, ADR-0013). Фильтровать на клиенте
/// ничего не нужно и не нужно пытаться: сервер уже ограничил выборку.
class AthleteRepository {
  AthleteRepository({required ApiClient client}) : _client = client;

  final ApiClient _client;

  Future<List<LinkedAthlete>> listLinked(String token) async {
    final response = await _client.getJson('/me/athletes', token: token);

    // Список приходит массивом; `HttpApiClient` оборачивает его в `data`, чтобы
    // вызывающий код не разбирал два разных типа ответа.
    final raw = response['data'] ?? response;
    if (raw is! List) {
      return const [];
    }

    return raw
        .whereType<Map<String, dynamic>>()
        .map(LinkedAthlete.fromJson)
        .toList(growable: false);
  }
}
