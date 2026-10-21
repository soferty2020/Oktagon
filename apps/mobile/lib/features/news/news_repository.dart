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

  /// Все опубликованные новости, закрепленные сверху.
  ///
  /// Черновики и архивные отсекает backend: клиент не должен полагаться на
  /// собственную фильтрацию, иначе при ошибке в ней показал бы черновик.
  Future<List<NewsPost>> listPublished(String token) async {
    final response = await _client.getJson('/news', token: token);

    final raw = response['data'] ?? response;
    if (raw is! List) {
      return const [];
    }

    final posts = raw.whereType<Map<String, dynamic>>().map(NewsPost.fromJson).toList();

    posts.sort((left, right) {
      // Закрепленное всегда выше: клуб закрепил объявление, потому что оно важно
      // не свежестью.
      if (left.isPinned != right.isPinned) {
        return left.isPinned ? -1 : 1;
      }
      final leftDate = left.publishedAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final rightDate = right.publishedAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      return rightDate.compareTo(leftDate);
    });

    return posts;
  }

  /// Последнее опубликованное объявление или `null`, если новостей нет.
  Future<NewsPost?> latestPublished(String token) async {
    final posts = await listPublished(token);
    return posts.isEmpty ? null : posts.first;
  }
}
