import '../../core/api_client.dart';
import 'sports_models.dart';

/// Репозиторий мероприятий ребёнка (#41).
///
/// Один запрос `GET /me/sports`: сервер сам фильтрует по связанным спортсменам и
/// скрывает неопубликованные результаты, поэтому клиент не собирает данные по
/// частям и не может показать лишнее.
abstract class SportsRepository {
  Future<MeSportsOverview> fetchOverview(String token);
}

class ApiSportsRepository implements SportsRepository {
  const ApiSportsRepository({required this.client});

  final ApiClient client;

  @override
  Future<MeSportsOverview> fetchOverview(String token) async {
    final json = await client.getJson('/me/sports', token: token);
    return MeSportsOverview.fromJson(json);
  }
}
