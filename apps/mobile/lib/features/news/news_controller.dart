import 'package:flutter/foundation.dart';

import '../../core/api_exception.dart';
import '../news/news_repository.dart';

/// Новости клуба (H7).
///
/// Отдельный контроллер от главной: на главной показывается одно объявление, а
/// здесь — весь список. Общий контроллер тянул бы полный список на главную, где
/// он не нужен.
class NewsController extends ChangeNotifier {
  NewsController({required NewsRepository repository}) : _repository = repository;

  final NewsRepository _repository;

  bool _loading = false;
  String? _error;
  List<NewsPost> _posts = const [];

  bool get loading => _loading;
  String? get error => _error;
  List<NewsPost> get posts => _posts;

  Future<void> load(String token) async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      _posts = await _repository.listPublished(token);
    } on ApiException catch (error) {
      _error = _describe(error);
      _posts = const [];
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  String _describe(ApiException error) {
    return switch (error.code) {
      'NETWORK' => 'Нет связи с сервером. Проверьте соединение и повторите.',
      'UNAUTHENTICATED' => 'Сессия истекла. Войдите заново.',
      _ => error.message,
    };
  }
}
