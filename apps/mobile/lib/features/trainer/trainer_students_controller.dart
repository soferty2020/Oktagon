import 'package:flutter/foundation.dart';

import '../../core/api_exception.dart';
import 'trainer_repository.dart';

/// Ученик тренера: спортсмен из его групп.
class TrainerStudent {
  const TrainerStudent({
    required this.athleteId,
    required this.firstName,
    required this.lastName,
    required this.groupNames,
  });

  final String athleteId;
  final String firstName;
  final String lastName;

  /// Группы, в которых числится спортсмен: один ребенок может ходить в две.
  final List<String> groupNames;

  String get displayName => '$lastName $firstName'.trim();

  TrainerStudent withGroup(String groupName) => TrainerStudent(
        athleteId: athleteId,
        firstName: firstName,
        lastName: lastName,
        groupNames: groupNames.contains(groupName) ? groupNames : [...groupNames, groupName],
      );
}

/// Экран «Ученики» тренера (H10).
///
/// Состав собирается из групп тренера, потому что отдельного метода «мои ученики»
/// в контракте нет. Один ребенок может быть в двух группах — он показывается
/// один раз, с обеими группами.
class TrainerStudentsController extends ChangeNotifier {
  TrainerStudentsController({required TrainerRepository repository})
      : _repository = repository;

  final TrainerRepository _repository;

  bool _loading = false;
  String? _error;
  List<TrainerStudent> _students = const [];
  String _query = '';

  bool get loading => _loading;
  String? get error => _error;
  String get query => _query;

  /// Ученики с учетом поиска.
  List<TrainerStudent> get students {
    if (_query.trim().isEmpty) {
      return _students;
    }
    final needle = _query.trim().toLowerCase();
    return _students
        .where((student) => student.displayName.toLowerCase().contains(needle))
        .toList(growable: false);
  }

  int get totalCount => _students.length;

  void search(String query) {
    _query = query;
    notifyListeners();
  }

  Future<void> load(String token) async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      final groups = await _repository.listGroups(token);

      final byId = <String, TrainerStudent>{};
      for (final group in groups) {
        final members = await _repository.groupMembers(token: token, groupId: group.id);
        for (final member in members) {
          final existing = byId[member.athleteId];
          if (existing == null) {
            byId[member.athleteId] = TrainerStudent(
              athleteId: member.athleteId,
              firstName: member.firstName,
              lastName: member.lastName,
              groupNames: [group.name],
            );
          } else {
            byId[member.athleteId] = existing.withGroup(group.name);
          }
        }
      }

      _students = byId.values.toList()
        ..sort((left, right) => left.displayName.compareTo(right.displayName));
    } on ApiException catch (error) {
      _error = _describe(error);
      _students = const [];
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
