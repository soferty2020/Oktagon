import 'package:flutter/foundation.dart';

import '../../core/api_exception.dart';
import '../athletes/athlete_models.dart';
import '../athletes/athlete_repository.dart';
import '../attendance/attendance_repository.dart';
import '../groups/group_repository.dart';
import '../news/news_repository.dart';
import '../schedule/schedule_models.dart';
import '../schedule/schedule_repository.dart';

/// Данные главной участника (H2–H3).
///
/// Собирает четыре источника: спортсменов аккаунта, группу выбранного,
/// ближайшее занятие, посещаемость за месяц и последнее объявление. Один
/// контроллер вместо четырех: блоки главной зависят от одного выбора
/// (спортсмена), и раздельные контроллеры дублировали бы это состояние.
class MemberHomeController extends ChangeNotifier {
  MemberHomeController({
    required AthleteRepository athletes,
    required GroupRepository groups,
    required ScheduleRepository schedule,
    required AttendanceRepository attendance,
    required NewsRepository news,
    DateTime Function()? clock,
  })  : _athleteRepository = athletes,
        _groups = groups,
        _schedule = schedule,
        _attendance = attendance,
        _news = news,
        _clock = clock ?? DateTime.now;

  final AthleteRepository _athleteRepository;
  final GroupRepository _groups;
  final ScheduleRepository _schedule;
  final AttendanceRepository _attendance;
  final NewsRepository _news;

  /// Источник времени: подменяется в тестах, чтобы «ближайшее занятие» не
  /// зависело от даты запуска.
  final DateTime Function() _clock;

  bool _loading = false;
  String? _error;
  String? _token;
  List<LinkedAthlete> _athletes = const [];
  LinkedAthlete? _selected;
  GroupSummary? _group;
  TrainingSession? _nextSession;
  AthleteAttendance? _attendanceSummary;
  NewsPost? _latestNews;

  bool get loading => _loading;
  String? get error => _error;
  List<LinkedAthlete> get athletes => _athletes;
  LinkedAthlete? get selected => _selected;
  GroupSummary? get group => _group;

  /// Ближайшее занятие впереди или `null`, если его нет.
  TrainingSession? get nextSession => _nextSession;
  AthleteAttendance? get attendance => _attendanceSummary;
  NewsPost? get latestNews => _latestNews;

  /// Загружает спортсменов и данные по основному.
  Future<void> load(String token) async {
    _token = token;
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      _athletes = await _athleteRepository.listLinked(token);
      _selected = _pickPrimary(_athletes);
      await _loadForSelected();
    } on ApiException catch (error) {
      _error = _describe(error);
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Переключает спортсмена и подгружает его данные.
  Future<void> select(LinkedAthlete athlete) async {
    if (_token == null || athlete.id == _selected?.id) {
      return;
    }

    _selected = athlete;
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      await _loadForSelected();
    } on ApiException catch (error) {
      _error = _describe(error);
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Повторная загрузка после ошибки.
  Future<void> retry() async {
    final token = _token;
    if (token != null) {
      await load(token);
    }
  }

  LinkedAthlete? _pickPrimary(List<LinkedAthlete> athletes) {
    if (athletes.isEmpty) {
      return null;
    }
    // Основной спортсмен открывается первым: родитель чаще смотрит его
    // расписание, а остальных выбирает осознанно.
    for (final athlete in athletes) {
      if (athlete.isPrimary) {
        return athlete;
      }
    }
    return athletes.first;
  }

  Future<void> _loadForSelected() async {
    final athlete = _selected;
    final token = _token;
    if (athlete == null || token == null) {
      _group = null;
      _nextSession = null;
      _attendanceSummary = null;
      _latestNews = null;
      return;
    }

    _group = await _groups.currentForAthlete(token: token, athleteId: athlete.id);

    final group = _group;
    if (group == null) {
      _nextSession = null;
      _attendanceSummary = null;
    } else {
      final now = _clock();
      final sessions = await _schedule.listForGroup(
        token: token,
        groupId: group.id,
        from: now,
        to: now.add(const Duration(days: 30)),
      );
      _nextSession = _findNextSession(sessions, now);

      // Посещаемость считается за текущий календарный месяц: это период, за
      // который родитель платит и о котором спрашивает.
      final monthStart = DateTime(now.year, now.month);
      final monthEnd = DateTime(now.year, now.month + 1);
      _attendanceSummary = await _attendance.forAthlete(
        token: token,
        groupId: group.id,
        athleteId: athlete.id,
        from: monthStart,
        to: monthEnd,
      );
    }

    _latestNews = await _news.latestPublished(token);
  }

  /// Ближайшее неотменённое занятие, которое еще не началось.
  ///
  /// Отменённые пропускаются: показывать «тренировка отменена» вместо следующей
  /// было бы бесполезно. Занятия в прошлом тоже не подходят — это не «ближайшее».
  TrainingSession? _findNextSession(List<TrainingSession> sessions, DateTime now) {
    final upcoming = sessions
        .where((session) => !session.isCancelled && session.startsAt.isAfter(now))
        .toList()
      ..sort((left, right) => left.startsAt.compareTo(right.startsAt));

    return upcoming.isEmpty ? null : upcoming.first;
  }

  String _describe(ApiException error) {
    return switch (error.code) {
      'NETWORK' => 'Нет связи с сервером. Проверьте соединение и повторите.',
      'UNAUTHENTICATED' => 'Сессия истекла. Войдите заново.',
      'FORBIDDEN' => 'Нет доступа к этим данным.',
      _ => error.message,
    };
  }
}
