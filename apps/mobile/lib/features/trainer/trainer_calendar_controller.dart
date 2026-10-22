import 'package:flutter/foundation.dart';

import '../../core/api_exception.dart';
import '../schedule/schedule_controller.dart';
import 'trainer_repository.dart';

/// Календарь тренера: занятия всех его групп по дням (H10).
///
/// Отдельно от «Сегодня», потому что периоды разные: «Сегодня» отвечает на вопрос
/// «что у меня сейчас», календарь — «когда следующая тренировка группы».
class TrainerCalendarController extends ChangeNotifier {
  TrainerCalendarController({
    required TrainerRepository repository,
    DateTime Function()? clock,
  })  : _repository = repository,
        _clock = clock ?? DateTime.now;

  final TrainerRepository _repository;
  final DateTime Function() _clock;

  bool _loading = false;
  String? _error;
  List<ScheduleDay> _days = const [];
  String? _token;

  bool get loading => _loading;
  String? get error => _error;
  List<ScheduleDay> get days => _days;
  bool get isEmpty => _days.isEmpty;

  /// Загружает две недели от сегодня: неделя может быть пустой из-за каникул, и
  /// тренер решил бы, что занятий нет вообще.
  Future<void> load(String token) async {
    _token = token;
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      final groups = await _repository.listGroups(token);
      final now = _clock();
      final from = DateTime(now.year, now.month, now.day);
      final to = from.add(const Duration(days: 14));

      final sessions = await _repository.listSessions(
        token: token,
        groupIds: groups.map((group) => group.id).toList(),
        from: from,
        to: to,
      );

      _days = ScheduleController.groupByDay(sessions);
    } on ApiException catch (error) {
      _error = _describe(error);
      _days = const [];
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> retry() async {
    final token = _token;
    if (token != null) {
      await load(token);
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
