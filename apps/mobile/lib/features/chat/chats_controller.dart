import 'package:flutter/foundation.dart';

import '../../core/api_exception.dart';
import 'chat_models.dart';
import 'chat_repository.dart';

/// Список диалогов (H8).
///
/// Обновляется вручную (pull-to-refresh) и при возврате из переписки: отдельного
/// канала событий в API нет, а опрашивать сервер по таймеру на мобильной сети
/// дороже, чем обновить список, когда пользователь сам его открыл.
class ChatsController extends ChangeNotifier {
  ChatsController({required ChatRepository repository}) : _repository = repository;

  final ChatRepository _repository;

  bool _loading = false;
  String? _error;
  List<ChatConversation> _conversations = const [];
  String? _token;
  String? _currentUserId;

  bool get loading => _loading;
  String? get error => _error;
  List<ChatConversation> get conversations => _conversations;
  bool get isEmpty => _conversations.isEmpty;

  /// Сумма непрочитанных: по ней на вкладке показывается значок.
  int get unreadTotal =>
      _conversations.fold(0, (sum, conversation) => sum + conversation.unreadCount);

  Future<void> load({required String token, required String currentUserId}) async {
    _token = token;
    _currentUserId = currentUserId;
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      _conversations = await _repository.list(token: token, currentUserId: currentUserId);
    } on ApiException catch (error) {
      _error = _describe(error);
      _conversations = const [];
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Тихое обновление после возврата из переписки: без индикатора загрузки,
  /// чтобы список не мигал.
  Future<void> refresh() async {
    final token = _token;
    final userId = _currentUserId;
    if (token == null || userId == null) {
      return;
    }

    try {
      _conversations = await _repository.list(token: token, currentUserId: userId);
      notifyListeners();
    } on ApiException {
      // Ошибка тихого обновления не должна стирать уже показанный список.
    }
  }

  Future<void> retry() async {
    final token = _token;
    final userId = _currentUserId;
    if (token != null && userId != null) {
      await load(token: token, currentUserId: userId);
    }
  }

  String _describe(ApiException error) {
    return switch (error.code) {
      'NETWORK' => 'Нет связи с сервером. Проверьте соединение и повторите.',
      'UNAUTHENTICATED' => 'Сессия истекла. Войдите заново.',
      'FORBIDDEN' => 'Нет доступа к чатам.',
      _ => error.message,
    };
  }
}
