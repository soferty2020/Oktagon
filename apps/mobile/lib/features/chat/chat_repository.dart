import '../../core/api_client.dart';
import 'chat_models.dart';

/// Данные чатов (BR-012, ADR-0011).
///
/// Доступ определяется участием, а не ролью: список приходит только с теми
/// диалогами, где пользователь состоит, поэтому фильтровать на клиенте не нужно.
class ChatRepository {
  ChatRepository({required ApiClient client}) : _client = client;

  final ApiClient _client;

  /// Диалоги пользователя с числом непрочитанных.
  Future<List<ChatConversation>> list({
    required String token,
    required String currentUserId,
  }) async {
    final response = await _client.getJson('/conversations', token: token);

    final raw = response['data'] ?? response;
    if (raw is! List) {
      return const [];
    }

    return raw
        .whereType<Map<String, dynamic>>()
        .map((item) => ChatConversation.fromJson(item, currentUserId: currentUserId))
        .toList(growable: false);
  }

  /// История диалога. Чтение сдвигает отметку о прочитанном на сервере.
  Future<ChatDetails> details({
    required String token,
    required String conversationId,
    required String currentUserId,
  }) async {
    final response = await _client.getJson(
      '/conversations/$conversationId',
      token: token,
    );
    return ChatDetails.fromJson(response, currentUserId: currentUserId);
  }

  /// Отправка сообщения.
  Future<ChatMessage> send({
    required String token,
    required String conversationId,
    required String body,
    required String currentUserId,
  }) async {
    final response = await _client.postJson(
      '/conversations/$conversationId/messages',
      body: {'body': body},
      token: token,
    );
    return ChatMessage.fromJson(response, currentUserId: currentUserId);
  }
}
