/// Участник диалога.
///
/// Роль участника в диалоге (`TRAINER`/`PARENT`) показывается в интерфейсе: в
/// групповом чате встречаются и тренеры, и родители, и по ней видно, кто отвечает.
class ChatParticipant {
  const ChatParticipant({
    required this.userId,
    required this.firstName,
    required this.lastName,
    required this.role,
  });

  final String userId;
  final String firstName;
  final String lastName;
  final String role;

  String get displayName => '$firstName $lastName'.trim();

  bool get isTrainer => role == 'TRAINER';

  factory ChatParticipant.fromJson(Map<String, dynamic> json) {
    return ChatParticipant(
      userId: json['userId'] as String,
      firstName: (json['firstName'] as String?) ?? '',
      lastName: (json['lastName'] as String?) ?? '',
      role: (json['role'] as String?) ?? '',
    );
  }
}

/// Сообщение диалога.
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.sender,
    required this.body,
    required this.isDeleted,
    required this.createdAt,
    required this.isMine,
  });

  final String id;
  final ChatParticipant sender;

  /// У удаленного сообщения пустой: сервер не отдает текст (ADR-0012).
  final String body;

  final bool isDeleted;
  final DateTime createdAt;

  /// Отправлено текущим пользователем: определяет сторону и цвет пузыря.
  final bool isMine;

  factory ChatMessage.fromJson(Map<String, dynamic> json, {required String currentUserId}) {
    final sender = ChatParticipant.fromJson(json['sender'] as Map<String, dynamic>);
    return ChatMessage(
      id: json['id'] as String,
      sender: sender,
      body: (json['body'] as String?) ?? '',
      isDeleted: json['isDeleted'] as bool? ?? false,
      createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
      isMine: sender.userId == currentUserId,
    );
  }
}

/// Диалог в списке чатов.
class ChatConversation {
  const ChatConversation({
    required this.id,
    required this.type,
    required this.title,
    required this.participants,
    required this.lastMessage,
    required this.unreadCount,
    required this.lastMessageAt,
  });

  final String id;

  /// `GROUP` — чат группы, `PRIVATE` — личная переписка.
  final String type;

  /// У группового чата — имя группы, у личного — имя собеседника.
  final String title;

  final List<ChatParticipant> participants;
  final ChatMessage? lastMessage;
  final int unreadCount;
  final DateTime? lastMessageAt;

  bool get isGroup => type == 'GROUP';

  factory ChatConversation.fromJson(Map<String, dynamic> json, {required String currentUserId}) {
    final last = json['lastMessage'];
    final participants = json['participants'];

    return ChatConversation(
      id: json['id'] as String,
      type: (json['type'] as String?) ?? 'PRIVATE',
      title: (json['title'] as String?) ?? 'Диалог',
      participants: participants is List
          ? participants
              .whereType<Map<String, dynamic>>()
              .map(ChatParticipant.fromJson)
              .toList(growable: false)
          : const [],
      lastMessage: last is Map<String, dynamic>
          ? ChatMessage.fromJson(last, currentUserId: currentUserId)
          : null,
      unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
      lastMessageAt: json['lastMessageAt'] == null
          ? null
          : DateTime.parse(json['lastMessageAt'] as String).toLocal(),
    );
  }
}

/// Диалог с историей сообщений.
class ChatDetails {
  const ChatDetails({
    required this.conversation,
    required this.messages,
  });

  final ChatConversation conversation;

  /// От старых к новым.
  final List<ChatMessage> messages;

  factory ChatDetails.fromJson(Map<String, dynamic> json, {required String currentUserId}) {
    final raw = json['messages'];

    return ChatDetails(
      conversation: ChatConversation.fromJson(json, currentUserId: currentUserId),
      messages: raw is List
          ? raw
              .whereType<Map<String, dynamic>>()
              .map((item) => ChatMessage.fromJson(item, currentUserId: currentUserId))
              .toList(growable: false)
          : const [],
    );
  }
}
