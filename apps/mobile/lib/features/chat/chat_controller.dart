import 'package:flutter/foundation.dart';

import '../../core/api_exception.dart';
import 'chat_models.dart';
import 'chat_repository.dart';

/// Переписка (H8).
///
/// Отправка блокирует поле ввода до ответа сервера и перезагружает историю: так
/// порядок и время сообщений остаются серверными, а локальная копия не расходится
/// с ними. Кнопка показывает состояние отправки, чтобы нажатие не выглядело
/// потерянным.
class ChatController extends ChangeNotifier {
  ChatController({required ChatRepository repository}) : _repository = repository;

  final ChatRepository _repository;

  bool _loading = false;
  bool _sending = false;
  String? _error;
  ChatDetails? _details;

  bool get loading => _loading;
  bool get sending => _sending;
  String? get error => _error;
  ChatDetails? get details => _details;

  List<ChatMessage> get messages => _details?.messages ?? const [];

  Future<void> load({
    required String token,
    required String conversationId,
    required String currentUserId,
  }) async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      _details = await _repository.details(
        token: token,
        conversationId: conversationId,
        currentUserId: currentUserId,
      );
    } on ApiException catch (error) {
      _error = _describe(error);
      _details = null;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<bool> send({
    required String token,
    required String conversationId,
    required String currentUserId,
    required String body,
  }) async {
    final text = body.trim();
    if (text.isEmpty || _sending) {
      return false;
    }

    _sending = true;
    _error = null;
    notifyListeners();

    try {
      await _repository.send(
        token: token,
        conversationId: conversationId,
        body: text,
        currentUserId: currentUserId,
      );

      // После успешной отправки история перезагружается: сервер решает порядок
      // сообщений и время, а локальная копия могла бы разойтись с ним.
      _details = await _repository.details(
        token: token,
        conversationId: conversationId,
        currentUserId: currentUserId,
      );
      return true;
    } on ApiException catch (error) {
      _error = _describe(error);
      return false;
    } finally {
      _sending = false;
      notifyListeners();
    }
  }

  void clearError() {
    if (_error != null) {
      _error = null;
      notifyListeners();
    }
  }

  String _describe(ApiException error) {
    return switch (error.code) {
      'NETWORK' => 'Нет связи с сервером. Сообщение не отправлено.',
      'UNAUTHENTICATED' => 'Сессия истекла. Войдите заново.',
      'FORBIDDEN' => 'Нет доступа к этому диалогу.',
      'VALIDATION_FAILED' => 'Сообщение пустое или слишком длинное.',
      _ => error.message,
    };
  }
}
