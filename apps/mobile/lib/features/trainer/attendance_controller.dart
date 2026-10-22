import 'package:flutter/foundation.dart';

import '../../core/api_exception.dart';
import 'trainer_models.dart';
import 'trainer_repository.dart';

/// Журнал посещаемости занятия (H10).
///
/// Отметки хранятся локально до сохранения: тренер ведет занятие и отмечает по
/// ходу, а не заполняет список целиком. Сохраняются только измененные записи,
/// чтобы не перезаписать отметки, сделанные с другого устройства.
class AttendanceController extends ChangeNotifier {
  AttendanceController({required TrainerRepository repository})
      : _repository = repository;

  final TrainerRepository _repository;

  bool _loading = false;
  bool _saving = false;
  String? _error;
  String? _savedMessage;
  SessionJournal? _journal;

  /// Измененные отметки: `athleteId` → состояние.
  final Map<String, AttendanceState> _changes = {};

  bool get loading => _loading;
  bool get saving => _saving;
  String? get error => _error;
  String? get savedMessage => _savedMessage;
  SessionJournal? get journal => _journal;

  /// Есть ли несохраненные изменения: по нему блокируется кнопка и показывается
  /// подсказка, чтобы тренер не ушел с экрана, не сохранив отметки.
  bool get hasChanges => _changes.isNotEmpty;

  /// Текущее состояние спортсмена с учетом несохраненных правок.
  AttendanceState stateFor(String athleteId) {
    return _changes[athleteId] ?? _stateFromJournal(athleteId);
  }

  AttendanceState _stateFromJournal(String athleteId) {
    final roster = _journal?.roster ?? const <RosterEntry>[];
    for (final entry in roster) {
      if (entry.athleteId == athleteId) {
        return entry.state;
      }
    }
    return AttendanceState.none;
  }

  Future<void> load({required String token, required String sessionId}) async {
    _loading = true;
    _error = null;
    _savedMessage = null;
    _changes.clear();
    notifyListeners();

    try {
      _journal = await _repository.journal(token: token, sessionId: sessionId);
    } on ApiException catch (error) {
      _error = _describe(error);
      _journal = null;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Отметка спортсмена. Повторный выбор того же статуса снимает правку: тренер
  /// мог нажать по ошибке.
  void setState(String athleteId, AttendanceState state) {
    if (_stateFromJournal(athleteId) == state) {
      _changes.remove(athleteId);
    } else {
      _changes[athleteId] = state;
    }
    _savedMessage = null;
    notifyListeners();
  }

  /// Сохранение измененных отметок.
  Future<bool> save({required String token}) async {
    final journal = _journal;
    if (journal == null || _changes.isEmpty) {
      return true;
    }

    _saving = true;
    _error = null;
    notifyListeners();

    try {
      await _repository.saveAttendance(
        token: token,
        sessionId: journal.sessionId,
        marks: Map.of(_changes),
      );

      // После успешного сохранения журнал перезагружается: подтвержденные
      // отметки должны прийти с сервера, а не остаться локальной копией.
      _journal = await _repository.journal(token: token, sessionId: journal.sessionId);
      _changes.clear();
      _savedMessage = 'Отметки сохранены';
      return true;
    } on ApiException catch (error) {
      _error = _describe(error);
      return false;
    } finally {
      _saving = false;
      notifyListeners();
    }
  }

  String _describe(ApiException error) {
    return switch (error.code) {
      'NETWORK' => 'Нет связи с сервером. Отметки не сохранены.',
      'UNAUTHENTICATED' => 'Сессия истекла. Войдите заново.',
      'ATHLETE_NOT_IN_GROUP' => 'Спортсмен не числился в группе на дату занятия.',
      'FORBIDDEN' => 'Нет права отмечать посещаемость.',
      _ => error.message,
    };
  }
}
