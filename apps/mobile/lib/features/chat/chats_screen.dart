import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../auth/auth_controller.dart';
import 'chat_controller.dart';
import 'chat_models.dart';
import 'chat_screen.dart';
import 'chats_controller.dart';

/// Список диалогов (H8), оформление по макету.
///
/// Диалоги приходят только те, где пользователь состоит: групповые чаты своих
/// групп и личные переписки (ADR-0011). Поэтому раздел виден всем, у кого есть
/// хотя бы один диалог.
class ChatsScreen extends StatefulWidget {
  const ChatsScreen({
    super.key,
    required this.auth,
    required this.controller,
    required this.chatFactory,
    this.now = DateTime.now,
  });

  final AuthController auth;
  final ChatsController controller;

  /// Переписка создается на каждый диалог: состояние одной не должно переходить
  /// в другую.
  final ChatController Function() chatFactory;

  /// Источник текущего времени: в golden-тестах подменяется, иначе скриншот
  /// зависит от дня запуска.
  final DateTime Function() now;

  @override
  State<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends State<ChatsScreen> {
  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final token = widget.auth.session?.accessToken;
    final userId = widget.auth.user?.id;
    if (token != null && userId != null) {
      widget.controller.load(token: token, currentUserId: userId);
    }
  }

  Future<void> _open(ChatConversation conversation) async {
    final token = widget.auth.session?.accessToken;
    final userId = widget.auth.user?.id;
    if (token == null || userId == null) {
      return;
    }

    final chat = widget.chatFactory();
    await chat.load(token: token, conversationId: conversation.id, currentUserId: userId);

    if (!mounted) {
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => ChatScreen(
          auth: widget.auth,
          controller: chat,
          title: conversation.title,
        ),
      ),
    );

    // Возврат из переписки: чтение сдвинуло отметку на сервере, поэтому список
    // перезагружается без индикатора — иначе он мигал бы на каждом возврате.
    if (mounted) {
      await widget.controller.refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final controller = widget.controller;

        if (controller.loading && controller.conversations.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }

        final error = controller.error;
        if (error != null && controller.conversations.isEmpty) {
          return _ErrorView(message: error, onRetry: _load);
        }

        if (controller.conversations.isEmpty) {
          return const _EmptyView();
        }

        return RefreshIndicator(
          onRefresh: () async {
            final token = widget.auth.session?.accessToken;
            final userId = widget.auth.user?.id;
            if (token != null && userId != null) {
              await controller.load(token: token, currentUserId: userId);
            }
          },
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.lg,
              AppSpacing.xxl,
            ),
            itemCount: controller.conversations.length + 1,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
            itemBuilder: (context, index) {
              if (index == 0) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: Text(
                    'Чат',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                );
              }

              final conversation = controller.conversations[index - 1];
              return _ConversationTile(
                conversation: conversation,
                onTap: () => _open(conversation),
                now: widget.now,
              );
            },
          ),
        );
      },
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({
    required this.conversation,
    required this.onTap,
    this.now = DateTime.now,
  });

  final ChatConversation conversation;
  final VoidCallback onTap;

  /// Время для подписи «вчера»; в тестах подменяется.
  final DateTime Function() now;

  @override
  Widget build(BuildContext context) {
    final last = conversation.lastMessage;
    final initial = conversation.title.isEmpty
        ? '?'
        : conversation.title.characters.first.toUpperCase();

    // Для группового чата показывается, кто написал последним: иначе в чате
    // группы непонятно, отвечает тренер или другой родитель.
    final preview = last == null
        ? 'Сообщений пока нет'
        : last.isDeleted
            ? 'Сообщение удалено'
            : conversation.isGroup
                ? '${last.sender.firstName}: ${last.body}'
                : last.body;

    return Material(
      color: AppColors.background,
      borderRadius: BorderRadius.circular(AppRadius.card),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.card),
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.card),
            border: Border.all(color: AppColors.divider),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: conversation.isGroup
                    ? AppColors.surfaceMuted
                    : AppColors.accentSoft,
                child: conversation.isGroup
                    ? const Icon(Icons.groups, size: 20, color: AppColors.textSecondary)
                    : Text(
                        initial,
                        style: const TextStyle(
                          color: AppColors.accent,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            conversation.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        if (conversation.lastMessageAt != null)
                          Text(
                            _shortTime(conversation.lastMessageAt!, now: now()),
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.textTertiary,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            preview,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ),
                        if (conversation.unreadCount > 0) ...[
                          const SizedBox(width: AppSpacing.sm),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: AppSpacing.sm,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.accent,
                              borderRadius: BorderRadius.circular(AppRadius.pill),
                            ),
                            child: Text(
                              '${conversation.unreadCount}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.forum_outlined, size: 40, color: AppColors.textSecondary),
            const SizedBox(height: AppSpacing.md),
            Text('Диалогов пока нет', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpacing.sm),
            const Text(
              'Здесь появятся чат группы и личные переписки с тренером.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.cloud_off, size: 40, color: AppColors.textSecondary),
            const SizedBox(height: AppSpacing.md),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: AppSpacing.lg),
            FilledButton.tonal(onPressed: onRetry, child: const Text('Повторить')),
          ],
        ),
      ),
    );
  }
}

String _shortTime(DateTime value, {DateTime? now}) {
  final current = now ?? DateTime.now();
  final today = DateTime(current.year, current.month, current.day);
  final day = DateTime(value.year, value.month, value.day);

  if (day == today) {
    return '${value.hour.toString().padLeft(2, '0')}:'
        '${value.minute.toString().padLeft(2, '0')}';
  }
  if (today.difference(day).inDays == 1) {
    return 'вчера';
  }
  return '${value.day}.${value.month.toString().padLeft(2, '0')}';
}
