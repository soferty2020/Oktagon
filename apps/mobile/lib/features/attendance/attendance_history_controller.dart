import 'package:flutter/foundation.dart';

import '../../core/api_exception.dart';
import 'attendance_repository.dart';

/// История посещений спортсмена (H5).
///
/// Сводка считается по загруженным записям, а не отдельным запросом: данные уже
/// есть, и второй запрос за тем же ответил бы тем же.
class AttendanceHistoryController extends ChangeNotifier {
  AttendanceHistoryController({
    required AttendanceRepository repository,
    DateTime Function()? clock,
  })  : _repository = repository,
        _clock = clock ?? DateTime.now;

  final AttendanceRepository _repository;
  final DateTime Function() _clock;

  bool _loading = false;
  String? _error;
  List<AttendanceRecord> _records = const [];
  String? _token;
  String? _athleteId;

  bool get loading => _loading;
  String? get error => _error;
  List<AttendanceRecord> get records => _records;

  int get present => _records.where((r) => r.status == AttendanceRecordStatus.present).length;
  int get absent => _records.where((r) => r.status == AttendanceRecordStatus.absent).length;
  int get excused => _records.where((r) => r.status == AttendanceRecordStatus.excused).length;
  int get total => _records.length;

  /// Процент посещаемости от отмеченных занятий; `null`, если записей нет.
  int? get percent {
    if (_records.isEmpty) {
      return null;
    }
    return (present / _records.length * 100).round();
  }

  /// Загружает три месяца: за меньший период история выглядит пустой у тех, кто
  /// ходит редко, а за больший — теряется смысл экрана.
  Future<void> load({required String token, required String athleteId}) async {
    _token = token;
    _athleteId = athleteId;
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      final to = _clock();
      final from = to.subtract(const Duration(days: 90));

      _records = await _repository.history(
        token: token,
        athleteId: athleteId,
        from: from,
        to: to,
      );
    } on ApiException catch (error) {
      _error = _describe(error);
      _records = const [];
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> retry() async {
    final token = _token;
    final athleteId = _athleteId;
    if (token != null && athleteId != null) {
      await load(token: token, athleteId: athleteId);
    }
  }

  String _describe(ApiException error) {
    return switch (error.code) {
      'NETWORK' => 'Нет связи с сервером. Проверьте соединение и повторите.',
      'UNAUTHENTICATED' => 'Сессия истекла. Войдите заново.',
      'FORBIDDEN' => 'Нет доступа к посещаемости этого спортсмена.',
      _ => error.message,
    };
  }
}
