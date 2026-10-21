import 'package:flutter/foundation.dart';

import '../../core/api_exception.dart';
import '../schedule/schedule_models.dart';
import '../schedule/schedule_repository.dart';

/// Занятия по дням: ключ — дата без времени, значение — занятия этого дня.
///
/// Список на экране группируется по дням, а не идет плоской лентой: родитель
/// ищет «когда следующая тренировка», и дата — первый ориентир.
class ScheduleDay {
  const ScheduleDay({required this.date, required this.sessions});

  final DateTime date;
  final List<TrainingSession> sessions;
}

/// Расписание группы выбранного спортсмена (H4).
class ScheduleController extends ChangeNotifier {
  ScheduleController({
    required ScheduleRepository repository,
    DateTime Function()? clock,
  })  : _repository = repository,
        _clock = clock ?? DateTime.now;

  final ScheduleRepository _repository;
  final DateTime Function() _clock;

  bool _loading = false;
  String? _error;
  List<ScheduleDay> _days = const [];
  String? _groupName;

  bool get loading => _loading;
  String? get error => _error;
  List<ScheduleDay> get days => _days;
  String? get groupName => _groupName;

  /// Есть ли занятия в выбранном периоде.
  bool get isEmpty => _days.isEmpty;

  /// Загружает занятия на месяц вперед.
  ///
  /// Период — месяц: неделя слишком коротка (бывают пропуски из-за каникул), а
  /// квартал на телефоне не нужен.
  Future<void> load({
    required String token,
    required String? groupId,
  }) async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      if (groupId == null) {
        // Спортсмен без группы: расписания нет, но это не ошибка.
        _days = const [];
        _groupName = null;
        return;
      }

      final now = _clock();
      final sessions = await _repository.listForGroup(
        token: token,
        groupId: groupId,
        from: DateTime(now.year, now.month, now.day),
        to: DateTime(now.year, now.month + 1, now.day),
      );

      _days = groupByDay(sessions);
    } on ApiException catch (error) {
      _error = _describe(error);
      _days = const [];
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Группирует занятия по дням, пропуская отмененные.
  ///
  /// Отмененное занятие в расписании не показывается: место в календаре оно уже
  /// не занимает, а отдельная пометка только путала бы.
  static List<ScheduleDay> groupByDay(List<TrainingSession> sessions) {
    final byDate = <DateTime, List<TrainingSession>>{};

    for (final session in sessions) {
      if (session.isCancelled) {
        continue;
      }
      final date = DateTime(
        session.startsAt.year,
        session.startsAt.month,
        session.startsAt.day,
      );
      byDate.putIfAbsent(date, () => []).add(session);
    }

    final days = byDate.entries
        .map((entry) => ScheduleDay(
              date: entry.key,
              sessions: entry.value..sort(
                  (left, right) => left.startsAt.compareTo(right.startsAt),
                ),
            ))
        .toList()
      ..sort((left, right) => left.date.compareTo(right.date));

    return days;
  }

  String _describe(ApiException error) {
    return switch (error.code) {
      'NETWORK' => 'Нет связи с сервером. Проверьте соединение и повторите.',
      'UNAUTHENTICATED' => 'Сессия истекла. Войдите заново.',
      'FORBIDDEN' => 'Нет доступа к расписанию этой группы.',
      _ => error.message,
    };
  }
}
