import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/core/api_exception.dart';
import 'package:octagon_mobile/features/news/news_controller.dart';
import 'package:octagon_mobile/features/news/news_repository.dart';

import 'support/fake_api_client.dart';

Map<String, dynamic> post({
  required String id,
  required String title,
  required DateTime publishedAt,
  bool isPinned = false,
}) {
  return {
    'id': id,
    'title': title,
    'body': 'Текст объявления',
    'status': 'PUBLISHED',
    'author': {'id': 'user-1', 'firstName': 'Алия', 'lastName': 'Серик'},
    'isPinned': isPinned,
    'publishedAt': publishedAt.toIso8601String(),
    'archivedAt': null,
    'createdAt': publishedAt.toIso8601String(),
    'updatedAt': publishedAt.toIso8601String(),
    'commentsCount': 0,
    'canEdit': false,
  };
}

void main() {
  late FakeApiClient client;
  late NewsController controller;

  setUp(() {
    client = FakeApiClient();
    controller = NewsController(repository: NewsRepository(client: client));
  });

  test('закрепленные новости идут первыми, затем по дате', () async {
    client.responses['GET /news'] = {
      'data': [
        post(id: 'old', title: 'Старое', publishedAt: DateTime(2026, 9, 1)),
        post(
          id: 'pinned',
          title: 'Важное',
          publishedAt: DateTime(2026, 8, 1),
          isPinned: true,
        ),
        post(id: 'new', title: 'Новое', publishedAt: DateTime(2026, 10, 1)),
      ],
    };

    await controller.load('token');

    expect(
      controller.posts.map((item) => item.id),
      ['pinned', 'new', 'old'],
    );
  });

  test('пустой список не считается ошибкой', () async {
    client.responses['GET /news'] = {'data': <Map<String, dynamic>>[]};

    await controller.load('token');

    expect(controller.posts, isEmpty);
    expect(controller.error, isNull);
    expect(controller.loading, isFalse);
  });

  test('ошибка сети показывается понятным текстом', () async {
    client.errors['GET /news'] = const ApiException(
      code: 'NETWORK',
      message: 'Нет связи',
    );

    await controller.load('token');

    expect(controller.error, contains('Нет связи'));
    expect(controller.posts, isEmpty);
  });
}
