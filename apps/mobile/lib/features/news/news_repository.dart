import '../../core/api_client.dart';

/// Новость клуба (`GET /news`).
///
/// На главной показывается последнее опубликованное объявление — по BR-011 оно
/// видно всем пользователям клуба, отдельного права не требуется.
class NewsPost {
  const NewsPost({
    required this.id,
    required this.title,
    required this.body,
    required this.isPinned,
    required this.publishedAt,
  });

  final String id;
  final String title;
  final String body;
  final bool isPinned;
  final DateTime? publishedAt;

  factory NewsPost.fromJson(Map<String, dynamic> json) {
    final published = json['publishedAt'];
    return NewsPost(
      id: json['id'] as String,
      title: (json['title'] as String?) ?? '',
      body: (json['body'] as String?) ?? '',
      isPinned: json['isPinned'] == true,
      publishedAt: published is String ? DateTime.tryParse(published)?.toLocal() : null,
    );
  }
}

/// Новости клуба.
class NewsRepository {
  NewsRepository({required ApiClient client}) : _client = client;

  final ApiClient _client;

  /// Последнее опубликованное объявление или `null`, если новостей нет.
  ///
  /// Черновики и архивные в выборку не попадают: их отсекает backend, клиент не
  /// должен полагаться на собственную фильтрацию.
  Future<NewsPost?> latestPublished(String token) async {
    final response = await _client.getJson('/news', token: token);

    final raw = response['data'] ?? response;
    if (raw is! List) {
      return null;
    }

    final posts = raw.whereType<Map<String, dynamic>>().map(NewsPost.fromJson).toList();

    // Закрепленная новость важнее свежести: если клуб закрепил объявление, оно и
    // должно быть на главной.
    final pinned = posts.where((post) => post.isPinned).toList();
    if (pinned.isNotEmpty) {
      return pinned.first;
    }

    if (posts.isEmpty) {
      return null;
    }

    posts.sort((left, right) {
      final leftDate = left.publishedAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final rightDate = right.publishedAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      return rightDate.compareTo(leftDate);
    });
    return posts.first;
  }
}
