import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../auth/auth_controller.dart';
import '../news/news_controller.dart';
import '../news/news_repository.dart';

/// Новости клуба (H7), оформление по макету.
///
/// Новости видны всем пользователям клуба без отдельного права (BR-011), поэтому
/// раздел есть и у участника, и у тренера. Комментарии остаются в web-админке.
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
          return const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Header(),
              Expanded(child: Center(child: CircularProgressIndicator())),
            ],
          );
        }

        final error = controller.error;
        if (error != null) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _Header(),
              Expanded(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.xl),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.cloud_off,
                          size: 40,
                          color: AppColors.textSecondary,
                        ),
                        const SizedBox(height: AppSpacing.md),
                        Text(error, textAlign: TextAlign.center),
                        const SizedBox(height: AppSpacing.lg),
                        FilledButton.tonal(
                          onPressed: _load,
                          child: const Text('Повторить'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          );
        }

        if (controller.posts.isEmpty) {
          return const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Header(),
              Expanded(
                child: Center(
                  child: Padding(
                    padding: EdgeInsets.all(AppSpacing.xl),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.campaign_outlined,
                          size: 40,
                          color: AppColors.textSecondary,
                        ),
                        SizedBox(height: AppSpacing.md),
                        Text(
                          'Объявлений пока нет',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                        ),
                        SizedBox(height: AppSpacing.sm),
                        Text(
                          'Когда клуб опубликует новость, она появится здесь.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: AppColors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          );
        }

        return RefreshIndicator(
          onRefresh: () async => _load(),
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              0,
              AppSpacing.lg,
              AppSpacing.xxl,
            ),
            itemCount: controller.posts.length + 1,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
            itemBuilder: (context, index) {
              if (index == 0) {
                return const _Header();
              }
              return _NewsCard(post: controller.posts[index - 1]);
            },
          ),
        );
      },
    );
  }
}

/// Заголовок раздела.
class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.md,
      ),
      child: Text(
        'Новости клуба',
        style: Theme.of(context).textTheme.headlineMedium,
      ),
    );
  }
}

class _NewsCard extends StatelessWidget {
  const _NewsCard({required this.post});

  final NewsPost post;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (post.isPinned) ...[
                const Icon(Icons.push_pin, size: 14, color: AppColors.accent),
                const SizedBox(width: AppSpacing.xs),
              ],
              Expanded(
                child: Text(
                  post.title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
            ],
          ),
          if (post.publishedAt != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              _formatDate(post.publishedAt!),
              style: const TextStyle(fontSize: 12, color: AppColors.textTertiary),
            ),
          ],
          // Обложка (#70): первая фотография новости. Список показывает её
          // крупно, а не строкой «есть фото»: новость читают глазами.
          if (post.coverUrl != null) ...[
            const SizedBox(height: AppSpacing.sm),
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadius.card),
              child: Image.network(
                post.coverUrl!,
                fit: BoxFit.cover,
                height: 180,
                width: double.infinity,
                errorBuilder: (context, error, stackTrace) => const SizedBox.shrink(),
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          Text(
            post.body,
            style: const TextStyle(
              color: AppColors.textSecondary,
              height: 1.45,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}

String _formatDate(DateTime value) {
  return '${value.day}.${value.month.toString().padLeft(2, '0')}.${value.year}';
}
