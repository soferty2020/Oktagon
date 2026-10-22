import 'package:flutter/foundation.dart';

import '../../core/api_exception.dart';
import '../schedule/schedule_models.dart';
import 'trainer_models.dart';
import 'trainer_repository.dart';

/// Экран «Сегодня» тренера (H10).
///
/// Показывает занятия на сегодня и короткую сводку: сколько занятий, групп и
/// учеников. Сводка считается из уже загруженных данных, а не отдельными
/// запросами: на мобильной сети лишний запрос заметен.
class TrainerDayController extends ChangeNotifier {
  TrainerDayController({
    required TrainerRepository repository,
    DateTime Function()? clock,
  })  : _repository = repository,
        _clock = clock ?? DateTime.now;

  final TrainerRepository _repository;
  final DateTime Function() _clock;

  bool _loading = false;
  String? _error;
  List<TrainerGroup> _groups = const [];
  List<TrainingSession> _todaySessions = const [];
  String? _token;

  bool get loading => _loading;
  String? get error => _error;
  List<TrainerGroup> get groups => _groups;
  List<TrainingSession> get todaySessions => _todaySessions;

  /// Занятий сегодня.
  int get sessionsCount => _todaySessions.length;

  /// Групп у тренера.
  int get groupsCount => _groups.length;

  /// Учеников в группах (сумма по группам).
  int get studentsCount =>
      _groups.fold(0, (sum, group) => sum + group.activeMembersCount);

  Future<void> load(String token) async {
    _token = token;
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      _groups = await _repository.listGroups(token);

      final now = _clock();
      final dayStart = DateTime(now.year, now.month, now.day);
      final dayEnd = dayStart.add(const Duration(days: 1));

      final sessions = await _repository.listSessions(
        token: token,
        groupIds: _groups.map((group) => group.id).toList(),
        from: dayStart,
        to: dayEnd,
      );

      // Отмененные занятия не показываются: место в расписании они уже не
      // занимают, и тренеру не нужно подтверждать их проведение.
      _todaySessions = sessions
          .where((session) => !session.isCancelled)
          .toList(growable: false);
    } on ApiException catch (error) {
      _error = _describe(error);
      _todaySessions = const [];
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
      'FORBIDDEN' => 'Нет доступа к этим группам.',
      _ => error.message,
    };
  }
}
