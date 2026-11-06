import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/club_clock.dart';
import '../../design/tokens.dart';
import '../auth/auth_controller.dart';
import 'owner_session_details_screen.dart';

/// Расписание клуба для владельца: день, неделя и месяц.
///
/// Режимы отличаются представлением, а не только диапазоном запроса:
/// - день — список занятий выбранной даты, сгруппированный по залам;
/// - неделя — заголовки дней с датами и занятия под ними;
/// - месяц — календарная сетка с количеством занятий, нажатие открывает день.
///
/// Время показывается по часам клуба (Asia/Almaty), а не телефона.
class OwnerScheduleScreen extends StatefulWidget {
  const OwnerScheduleScreen({super.key, required this.auth, required this.client});

  final AuthController auth;
  final ApiClient client;

  @override
  State<OwnerScheduleScreen> createState() => _OwnerScheduleScreenState();
}

enum _Range { day, week, month }

class _OwnerScheduleScreenState extends State<OwnerScheduleScreen> {
  _Range _range = _Range.week;
  DateTime _anchor = DateTime.now();
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _sessions = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  DateTime get _rangeStart => switch (_range) {
        _Range.day => DateTime(_anchor.year, _anchor.month, _anchor.day),
        _Range.week =>
          DateTime(_anchor.year, _anchor.month, _anchor.day)
              .subtract(Duration(days: _anchor.weekday - 1)),
        _Range.month => DateTime(_anchor.year, _anchor.month, 1),
      };

  DateTime get _rangeEnd => switch (_range) {
        _Range.day => _rangeStart,
        _Range.week => _rangeStart.add(const Duration(days: 6)),
        _Range.month => DateTime(_anchor.year, _anchor.month + 1, 0),
      };

  Future<void> _load() async {
    final token = widget.auth.session?.accessToken;
    if (token == null) {
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await widget.client.getJson(
        '/training-sessions?from=${_fmt(_rangeStart)}&to=${_fmt(_rangeEnd)}',
        token: token,
      );
      final list = _listOf(response)
        ..sort((a, b) => ((a['startsAt'] as String?) ?? '')
            .compareTo((b['startsAt'] as String?) ?? ''));
      if (!mounted) {
        return;
      }
      setState(() => _sessions = list);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Не удалось загрузить расписание');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  String _fmt(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';

  void _shift(int direction) {
    setState(() {
      _anchor = switch (_range) {
        _Range.day => _anchor.add(Duration(days: direction)),
        _Range.week => _anchor.add(Duration(days: 7 * direction)),
        _Range.month => DateTime(_anchor.year, _anchor.month + direction, 1),
      };
    });
    _load();
  }

  void _changeRange(_Range range) {
    setState(() => _range = range);
    _load();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _anchor,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
      helpText: 'Выберите дату',
      cancelText: 'Отмена',
      confirmText: 'Выбрать',
    );
    if (picked == null) {
      return;
    }
    setState(() => _anchor = picked);
    if (_range == _Range.month) {
      // В месячном режиме выбор даты открывает её день — иначе непонятно,
      // что именно произошло.
      setState(() => _range = _Range.day);
    }
    unawaited(_load());
  }

  void _goToday() {
    setState(() => _anchor = DateTime.now());
    _load();
  }

  void _openDay(DateTime date) {
    setState(() {
      _anchor = date;
      _range = _Range.day;
    });
    _load();
  }

  void _openSession(Map<String, dynamic> session) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => OwnerSessionDetailsScreen(session: session),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Расписание', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 4),
              Text(_periodLabel(), style: const TextStyle(color: AppColors.textSecondary)),
              const SizedBox(height: 12),
              SegmentedButton<_Range>(
                segments: const [
                  ButtonSegment(value: _Range.day, label: Text('День')),
                  ButtonSegment(value: _Range.week, label: Text('Неделя')),
                  ButtonSegment(value: _Range.month, label: Text('Месяц')),
                ],
                selected: {_range},
                showSelectedIcon: false,
                onSelectionChanged: (value) => _changeRange(value.first),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  IconButton(
                    onPressed: () => _shift(-1),
                    icon: const Icon(Icons.chevron_left),
                    tooltip: 'Предыдущий период',
                  ),
                  IconButton(
                    onPressed: _pickDate,
                    icon: const Icon(Icons.calendar_month_outlined),
                    tooltip: 'Выбрать дату',
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: _goToday,
                    child: const Text('Сегодня'),
                  ),
                  const Spacer(),
                  IconButton(
                    onPressed: () => _shift(1),
                    icon: const Icon(Icons.chevron_right),
                    tooltip: 'Следующий период',
                  ),
                ],
              ),
            ],
          ),
        ),
        Expanded(child: _buildBody()),
      ],
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: 4,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (_, _) => Container(
          height: 76,
          decoration: BoxDecoration(
            color: AppColors.surfaceMuted,
            borderRadius: BorderRadius.circular(AppRadius.card),
          ),
        ),
      );
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, color: AppColors.danger, size: 40),
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 16),
            FilledButton(onPressed: _load, child: const Text('Повторить')),
          ],
        ),
      );
    }

    if (_sessions.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              _range == _Range.day ? 'На этот день занятий нет' : 'Занятий нет',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
            ),
            const SizedBox(height: 6),
            const Text('Выберите другой период',
                style: TextStyle(color: AppColors.textSecondary)),
          ],
        ),
      );
    }

    return switch (_range) {
      _Range.day => _DayView(sessions: _sessions, onOpen: _openSession),
      _Range.week => _WeekView(
          start: _rangeStart,
          sessions: _sessions,
          onOpen: _openSession,
        ),
      _Range.month => _MonthView(
          month: _anchor,
          sessions: _sessions,
          onOpenDay: _openDay,
        ),
    };
  }

  String _periodLabel() {
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];
    return switch (_range) {
      _Range.day => '${_anchor.day} ${months[_anchor.month - 1]} ${_anchor.year}',
      _Range.week =>
        '${_rangeStart.day}–${_rangeEnd.day} ${months[_rangeEnd.month - 1]}',
      _Range.month => '${months[_anchor.month - 1]} ${_anchor.year}',
    };
  }
}

/// День: занятия по залам, внутри — по времени.
class _DayView extends StatelessWidget {
  const _DayView({required this.sessions, required this.onOpen});

  final List<Map<String, dynamic>> sessions;
  final void Function(Map<String, dynamic>) onOpen;

  @override
  Widget build(BuildContext context) {
    final byHall = <String, List<Map<String, dynamic>>>{};
    for (final session in sessions) {
      final hall = (session['hallName'] as String?)?.trim();
      byHall.putIfAbsent(hall?.isNotEmpty == true ? hall! : 'Зал не указан',
          () => []).add(session);
    }

    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          for (final entry in byHall.entries) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 8, 2, 8),
              child: Text(entry.key,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            ),
            for (final session in entry.value)
              _SessionTile(session: session, onTap: () => onOpen(session)),
          ],
        ],
      ),
    );
  }
}

/// Неделя: заголовок дня с датой, под ним занятия.
class _WeekView extends StatelessWidget {
  const _WeekView({
    required this.start,
    required this.sessions,
    required this.onOpen,
  });

  final DateTime start;
  final List<Map<String, dynamic>> sessions;
  final void Function(Map<String, dynamic>) onOpen;

  static const _weekdays = [
    'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье',
  ];
  static const _months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];

  @override
  Widget build(BuildContext context) {
    final days = List.generate(7, (index) => start.add(Duration(days: index)));
    final today = DateTime.now();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        for (final day in days) ...[
          _DayHeader(
            title: '${_weekdays[day.weekday - 1]}, ${day.day} ${_months[day.month - 1]}',
            isToday: day.year == today.year &&
                day.month == today.month &&
                day.day == today.day,
            count: _sessionsOf(day).length,
          ),
          if (_sessionsOf(day).isEmpty)
            const Padding(
              padding: EdgeInsets.fromLTRB(4, 0, 4, 12),
              child: Text('Занятий нет',
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            )
          else
            for (final session in _sessionsOf(day))
              _SessionTile(session: session, onTap: () => onOpen(session)),
          const SizedBox(height: 8),
        ],
      ],
    );
  }

  List<Map<String, dynamic>> _sessionsOf(DateTime day) {
    return sessions.where((session) {
      final startsAt = session['startsAt'] as String?;
      if (startsAt == null) {
        return false;
      }
      final local = ClubClock.fromUtc(startsAt);
      return local.year == day.year && local.month == day.month && local.day == day.day;
    }).toList();
  }
}

class _DayHeader extends StatelessWidget {
  const _DayHeader({required this.title, required this.isToday, required this.count});

  final String title;
  final bool isToday;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 12, 2, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: isToday ? AppColors.accentDark : AppColors.textPrimary,
              ),
            ),
          ),
          if (isToday)
            const Padding(
              padding: EdgeInsets.only(right: 6),
              child: Text('сегодня',
                  style: TextStyle(fontSize: 11, color: AppColors.accentDark)),
            ),
          Text('$count',
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}

/// Месяц: сетка с количеством занятий. Тап по дате открывает её день.
class _MonthView extends StatelessWidget {
  const _MonthView({
    required this.month,
    required this.sessions,
    required this.onOpenDay,
  });

  final DateTime month;
  final List<Map<String, dynamic>> sessions;
  final void Function(DateTime) onOpenDay;

  static const _weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  @override
  Widget build(BuildContext context) {
    final first = DateTime(month.year, month.month, 1);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final leading = first.weekday - 1;
    final counts = <int, int>{};
    for (final session in sessions) {
      final startsAt = session['startsAt'] as String?;
      if (startsAt == null) {
        continue;
      }
      final local = ClubClock.fromUtc(startsAt);
      if (local.year == month.year && local.month == month.month) {
        counts[local.day] = (counts[local.day] ?? 0) + 1;
      }
    }
    final today = DateTime.now();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        Row(
          children: [
            for (final label in _weekdays)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Text(label,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          fontSize: 11, color: AppColors.textSecondary)),
                ),
              ),
          ],
        ),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 7,
            mainAxisSpacing: 6,
            crossAxisSpacing: 6,
            childAspectRatio: 0.95,
          ),
          itemCount: leading + daysInMonth,
          itemBuilder: (context, index) {
            if (index < leading) {
              return const SizedBox.shrink();
            }
            final day = index - leading + 1;
            final date = DateTime(month.year, month.month, day);
            final count = counts[day] ?? 0;
            final isToday = date.year == today.year &&
                date.month == today.month &&
                date.day == today.day;
            return _MonthCell(
              day: day,
              count: count,
              isToday: isToday,
              onTap: () => onOpenDay(date),
            );
          },
        ),
        if (counts.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 16),
            child: Text('В этом месяце занятий нет',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          ),
      ],
    );
  }
}

class _MonthCell extends StatelessWidget {
  const _MonthCell({
    required this.day,
    required this.count,
    required this.isToday,
    required this.onTap,
  });

  final int day;
  final int count;
  final bool isToday;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final hasSessions = count > 0;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        decoration: BoxDecoration(
          color: hasSessions ? AppColors.accentSoft : Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isToday ? AppColors.accent : AppColors.divider,
            width: isToday ? 1.5 : 1,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              '$day',
              style: TextStyle(
                fontSize: 13,
                fontWeight: hasSessions ? FontWeight.w700 : FontWeight.w500,
                color: hasSessions ? AppColors.accentDark : AppColors.textPrimary,
              ),
            ),
            if (hasSessions)
              Text(
                '$count зан.',
                style: const TextStyle(fontSize: 9, color: AppColors.accentDark),
              ),
          ],
        ),
      ),
    );
  }
}

class _SessionTile extends StatelessWidget {
  const _SessionTile({required this.session, required this.onTap});

  final Map<String, dynamic> session;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final start = session['startsAt'] as String?;
    final end = session['endsAt'] as String?;
    final group = session['groupName'] as String? ?? 'Группа не указана';
    final hall = session['hallName'] as String?;
    final trainer = session['trainerName'] as String?;
    final status = session['status'] as String?;
    final cancelled = status == 'CANCELLED';

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: BoxDecoration(
              border: Border(
                left: BorderSide(
                  color: cancelled ? AppColors.danger : AppColors.accent,
                  width: 3,
                ),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      '${ClubClock.formatTime(start)}'
                      '${end != null ? '–${ClubClock.formatTime(end)}' : ''}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const Spacer(),
                    if (cancelled)
                      const Text('отменено',
                          style: TextStyle(fontSize: 11, color: AppColors.danger)),
                  ],
                ),
                const SizedBox(height: 2),
                Text(group, style: const TextStyle(fontWeight: FontWeight.w600)),
                if (hall != null && hall.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(hall,
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.textSecondary)),
                ],
                if (trainer != null && trainer.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(trainer,
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.textSecondary)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Список из ответа API: клиент оборачивает массивы в `data`, страницы —
/// отдают `items`.
List<Map<String, dynamic>> _listOf(Map<String, dynamic> response) {
  final raw = response['data'] ?? response['items'];
  if (raw is List) {
    return raw.whereType<Map<String, dynamic>>().toList();
  }
  return const [];
}
