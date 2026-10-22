import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../auth/auth_controller.dart';
import 'chat_controller.dart';
import 'chat_models.dart';

/// Переписка (H8).
///
/// Пузыри: свои — справа с акцентом, чужие — слева на сером. В групповом чате у
/// чужого сообщения видно автора: в чате группы пишут и тренер, и другие
/// родители (BR-012).
class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    required this.auth,
    required this.controller,
    required this.title,
  });

  final AuthController auth;
  final ChatController controller;
  final String title;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final token = widget.auth.session?.accessToken;
    final userId = widget.auth.user?.id;
    final details = widget.controller.details;

    if (token == null || userId == null || details == null) {
      return;
    }

    final text = _inputController.text;
    _inputController.clear();

    final sent = await widget.controller.send(
      token: token,
      conversationId: details.conversation.id,
      currentUserId: userId,
      body: text,
    );

    if (!sent && mounted) {
      // Текст возвращается в поле: набирать его заново после сбоя сети — худшее,
      // что может сделать мессенджер.
      _inputController.text = text;
    }

    if (mounted) {
      _scrollToBottom();
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        return Scaffold(
          appBar: AppBar(
            title: Text(widget.title, overflow: TextOverflow.ellipsis),
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => Navigator.of(context).maybePop(),
            ),
          ),
          body: SafeArea(
            child: widget.controller.loading
                ? const Center(child: CircularProgressIndicator())
                : _buildMessages(context),
          ),
          bottomNavigationBar: _buildComposer(context),
        );
      },
    );
  }

  Widget _buildMessages(BuildContext context) {
    final error = widget.controller.error;
    final messages = widget.controller.messages;

    if (error != null && messages.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.cloud_off, size: 40, color: AppColors.textSecondary),
              const SizedBox(height: AppSpacing.md),
              Text(error, textAlign: TextAlign.center),
            ],
          ),
        ),
      );
    }

    if (messages.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(AppSpacing.xl),
          child: Text(
            'Сообщений пока нет. Напишите первым — это увидят участники диалога.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textSecondary),
          ),
        ),
      );
    }

    final isGroup = widget.controller.details?.conversation.isGroup ?? false;

    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.lg,
      ),
      itemCount: messages.length,
      itemBuilder: (context, index) {
        final message = messages[index];
        final previous = index > 0 ? messages[index - 1] : null;

        // Автор показывается только когда он меняется: иначе имя повторялось бы
        // у каждого сообщения подряд.
        final showAuthor = !message.isMine &&
            isGroup &&
            (previous == null || previous.sender.userId != message.sender.userId);

        return _MessageBubble(
          message: message,
          showAuthor: showAuthor,
          showTime: _shouldShowTime(message, messages, index),
        );
      },
    );
  }

  /// Время показывается у последнего сообщения серии: у каждого подряд оно
  /// создавало бы визуальный шум.
  bool _shouldShowTime(ChatMessage message, List<ChatMessage> messages, int index) {
    if (index == messages.length - 1) {
      return true;
    }
    final next = messages[index + 1];
    return next.sender.userId != message.sender.userId ||
        next.createdAt.difference(message.createdAt).inMinutes >= 5;
  }

  Widget _buildComposer(BuildContext context) {
    final sending = widget.controller.sending;
    final error = widget.controller.error;

    return Container(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.sm,
        AppSpacing.lg,
        AppSpacing.sm,
      ),
      decoration: const BoxDecoration(
        color: AppColors.background,
        border: Border(top: BorderSide(color: AppColors.divider)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (error != null && widget.controller.messages.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: Text(
                error,
                style: const TextStyle(color: AppColors.danger, fontSize: 12),
              ),
            ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _inputController,
                  enabled: !sending,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  decoration: const InputDecoration(
                    hintText: 'Сообщение',
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: AppSpacing.lg,
                      vertical: AppSpacing.md,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              SizedBox(
                width: 48,
                height: 48,
                child: IconButton.filled(
                  onPressed: sending ? null : _send,
                  style: IconButton.styleFrom(
                    backgroundColor: AppColors.accent,
                    foregroundColor: Colors.white,
                  ),
                  icon: sending
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.send, size: 18),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.message,
    required this.showAuthor,
    required this.showTime,
  });

  final ChatMessage message;
  final bool showAuthor;
  final bool showTime;

  @override
  Widget build(BuildContext context) {
    final isMine = message.isMine;

    return Padding(
      padding: EdgeInsets.only(top: showAuthor || isMine ? AppSpacing.md : AppSpacing.xs),
      child: Column(
        crossAxisAlignment: isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          if (showAuthor)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xs, left: AppSpacing.sm),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    message.sender.displayName,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  if (message.sender.isTrainer) ...[
                    const SizedBox(width: AppSpacing.xs),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(
                        color: AppColors.accentSoft,
                        borderRadius: BorderRadius.circular(AppRadius.chip),
                      ),
                      child: const Text(
                        'тренер',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: AppColors.accent,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.sizeOf(context).width * 0.78,
            ),
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.sm,
            ),
            decoration: BoxDecoration(
              color: isMine ? AppColors.accent : AppColors.surfaceMuted,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(AppRadius.card),
                topRight: const Radius.circular(AppRadius.card),
                bottomLeft: Radius.circular(isMine ? AppRadius.card : AppSpacing.xs),
                bottomRight: Radius.circular(isMine ? AppSpacing.xs : AppRadius.card),
              ),
            ),
            child: Text(
              message.isDeleted ? 'Сообщение удалено' : message.body,
              style: TextStyle(
                color: isMine ? Colors.white : AppColors.textPrimary,
                fontSize: 14,
                height: 1.35,
                fontStyle: message.isDeleted ? FontStyle.italic : FontStyle.normal,
              ),
            ),
          ),
          if (showTime)
            Padding(
              padding: const EdgeInsets.only(top: 2, left: AppSpacing.sm, right: AppSpacing.sm),
              child: Text(
                _time(message.createdAt),
                style: const TextStyle(fontSize: 10, color: AppColors.textTertiary),
              ),
            ),
        ],
      ),
    );
  }
}

String _time(DateTime value) {
  return '${value.hour.toString().padLeft(2, '0')}:'
      '${value.minute.toString().padLeft(2, '0')}';
}
