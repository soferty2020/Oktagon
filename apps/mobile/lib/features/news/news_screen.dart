import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import '../news/news_controller.dart';
import '../news/news_repository.dart';

/// Новости клуба (H7).
///
/// Новости видны всем пользователям клуба без отдельного права (BR-011), поэтому
/// раздел есть и у участника, и у тренера. Комментарии остаются в web-админке и в
/// следующих шагах: здесь только чтение объявлений.
class NewsScreen extends StatefulWidget {
  const NewsScreen({super.key, required this.auth, required this.controller});

  final AuthController auth;
  final NewsController controller;

  @override
  State<NewsScreen> createState() => _NewsScreenState();
}

class _NewsScreenState extends State<NewsScreen> {
  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final token = widget.auth.session?.accessToken;
    if (token != null) {
      widget.controller.load(token);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final controller = widget.controller;

        if (controller.loading) {
          return const Center(child: CircularProgressIndicator());
        }

        final error = controller.error;
        if (error != null) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.cloud_off, size: 40, color: Color(0xFF888888)),
                  const SizedBox(height: 12),
                  Text(error, textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  FilledButton.tonal(onPressed: _load, child: const Text('Повторить')),
                ],
              ),
            ),
          );
        }

        if (controller.posts.isEmpty) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.campaign_outlined, size: 40, color: Color(0xFF888888)),
                  SizedBox(height: 12),
                  Text(
                    'Объявлений пока нет',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'Когда клуб опубликует новость, она появится здесь.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Color(0xFF666666)),
                  ),
                ],
              ),
            ),
          );
        }

        return RefreshIndicator(
          onRefresh: () async => _load(),
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: controller.posts.length,
            separatorBuilder: (_, _) => const SizedBox(height: 12),
            itemBuilder: (context, index) => _NewsCard(post: controller.posts[index]),
          ),
        );
      },
    );
  }
}

class _NewsCard extends StatelessWidget {
  const _NewsCard({required this.post});

  final NewsPost post;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    post.title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                ),
                if (post.isPinned)
                  const Padding(
                    padding: EdgeInsets.only(left: 8),
                    child: Tooltip(
                      message: 'Закрепленное объявление',
                      child: Icon(Icons.push_pin, size: 16, color: Color(0xFFF26522)),
                    ),
                  ),
              ],
            ),
            if (post.publishedAt != null) ...[
              const SizedBox(height: 4),
              Text(
                _formatDate(post.publishedAt!),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: const Color(0xFF888888),
                    ),
              ),
            ],
            const SizedBox(height: 8),
            Text(
              post.body,
              style: const TextStyle(color: Color(0xFF444444), height: 1.4),
            ),
          ],
        ),
      ),
    );
  }
}

String _formatDate(DateTime value) {
  return '${value.day}.${value.month.toString().padLeft(2, '0')}.${value.year}';
}
