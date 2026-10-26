import 'package:flutter/foundation.dart';

import 'sports_models.dart';
import 'sports_repository.dart';

/// Состояние экрана «Спорт».
///
/// Хранит выбранного ребёнка: переключение между детьми должно сохраняться, пока
/// экран открыт, иначе родителю с двумя детьми приходится выбирать заново после
/// каждого обновления (#41).
class SportsController extends ChangeNotifier {
  SportsController({required this.repository});

  final SportsRepository repository;

  MeSportsOverview? _overview;
  String? _error;
  bool _loading = false;
  String? _selectedAthleteId;

  MeSportsOverview? get overview => _overview;
  String? get error => _error;
  bool get loading => _loading;

  /// Выбранный ребёнок; `null` — показать всех.
  String? get selectedAthleteId => _selectedAthleteId;

  /// Дети, по которым есть мероприятия.
  List<({String id, String name})> get athletes {
    final names = <String, String>{};

    for (final item in _overview?.attestations ?? const <MeAttestation>[]) {
      names[item.athleteId] = item.athleteName;
    }
    for (final item in _overview?.competitions ?? const <MeCompetition>[]) {
      names[item.athleteId] = item.athleteName;
    }

    final entries = names.entries.toList()..sort((a, b) => a.value.compareTo(b.value));
    return entries.map((entry) => (id: entry.key, name: entry.value)).toList(growable: false);
  }

  List<MeAttestation> get attestations {
    final items = _overview?.attestations ?? const <MeAttestation>[];
    if (_selectedAthleteId == null) {
      return items;
    }
    return items.where((item) => item.athleteId == _selectedAthleteId).toList(growable: false);
  }

  List<MeCompetition> get competitions {
    final items = _overview?.competitions ?? const <MeCompetition>[];
    if (_selectedAthleteId == null) {
      return items;
    }
    return items.where((item) => item.athleteId == _selectedAthleteId).toList(growable: false);
  }

  Future<void> load(String token) async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      _overview = await repository.fetchOverview(token);
    } catch (error) {
      _error = 'Не удалось загрузить мероприятия';
      _overview = null;
      if (kDebugMode) {
        debugPrint('SportsController.load: $error');
      }
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Переключение ребёнка. `null` — все дети.
  void selectAthlete(String? athleteId) {
    _selectedAthleteId = athleteId;
    notifyListeners();
  }
}
