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
    this.coverUrl,
  });

  final String id;
  final String title;
  final String body;
  final bool isPinned;
  final DateTime? publishedAt;

  /// Обложка новости (#70): первая фотография, абсолютный адрес.
  final String? coverUrl;

  factory NewsPost.fromJson(Map<String, dynamic> json, {String? mediaBase}) {
    final published = json['publishedAt'];
    return NewsPost(
      id: json['id'] as String,
      title: (json['title'] as String?) ?? '',
      body: (json['body'] as String?) ?? '',
      isPinned: json['isPinned'] == true,
      publishedAt: published is String ? DateTime.tryParse(published)?.toLocal() : null,
      coverUrl: _coverUrl(json, mediaBase),
    );
  }
}

/// Новости клуба.
class NewsRepository {
  NewsRepository({required ApiClient client, String? mediaBase})
      : _client = client,
        _mediaBase = mediaBase;

  final ApiClient _client;

  /// База для картинок: /media/... лежит вне /api/v1, поэтому адрес
  /// собирается из того же хоста без префикса API.
  final String? _mediaBase;

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

    final posts = raw
        .whereType<Map<String, dynamic>>()
        .map((item) => NewsPost.fromJson(item, mediaBase: _mediaBase))
        .toList();

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

/// Первая фотография новости как обложка (#70).
String? _coverUrl(Map<String, dynamic> json, String? mediaBase) {
  final images = json['images'];
  if (images is! List || images.isEmpty) {
    return null;
  }

  final first = images.first;
  if (first is! Map<String, dynamic>) {
    return null;
  }

  final url = first['url'] as String?;
  if (url == null || url.isEmpty) {
    return null;
  }

  // API отдаёт относительный путь: абсолютный собирает клиент, потому что
  // публичный адрес знает только он.
  if (url.startsWith('http') || mediaBase == null) {
    return url;
  }

  return '$mediaBase$url';
}