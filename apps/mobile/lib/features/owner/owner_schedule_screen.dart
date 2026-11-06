import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../design/tokens.dart';
import '../auth/auth_controller.dart';

/// Расписание клуба для владельца: день, неделя и список занятий.
///
/// Читает `/training-sessions` за выбранный диапазон — тот же эндпоинт, что и
/// веб-админка. Отдельного «мобильного» расписания нет намеренно: время и
/// состав занятий должны совпадать с админкой.
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

    String fmt(DateTime date) =>
        '${date.year.toString().padLeft(4, '0')}-'
        '${date.month.toString().padLeft(2, '0')}-'
        '${date.day.toString().padLeft(2, '0')}';

    try {
      final response = await widget.client.getJson(
        '/training-sessions?from=${fmt(_rangeStart)}&to=${fmt(_rangeEnd)}',
        token: token,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _sessions = _listOf(response)
          ..sort((a, b) {
            final left = a['startsAt'] as String? ?? '';
            final right = b['startsAt'] as String? ?? '';
            return left.compareTo(right);
          });
      });
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
              Text('Расписание',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 4),
              Text(_periodLabel(),
                  style: const TextStyle(color: AppColors.textSecondary)),
              const SizedBox(height: 12),
              SegmentedButton<_Range>(
                segments: const [
                  ButtonSegment(value: _Range.day, label: Text('День')),
                  ButtonSegment(value: _Range.week, label: Text('Неделя')),
                  ButtonSegment(value: _Range.month, label: Text('Месяц')),
                ],
                selected: {_range},
                showSelectedIcon: false,
                onSelectionChanged: (value) {
                  setState(() => _range = value.first);
                  _load();
                },
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  IconButton(
                    onPressed: () => _shift(-1),
                    icon: const Icon(Icons.chevron_left),
                    tooltip: 'Назад',
                  ),
                  const Spacer(),
                  IconButton(
                    onPressed: () {
                      setState(() => _anchor = DateTime.now());
                      _load();
                    },
                    icon: const Icon(Icons.today_outlined),
                    tooltip: 'Сегодня',
                  ),
                  IconButton(
                    onPressed: () => _shift(1),
                    icon: const Icon(Icons.chevron_right),
                    tooltip: 'Вперёд',
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
            const Text('Выберите другой период или создайте занятие в веб-админке',
                style: TextStyle(color: AppColors.textSecondary)),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        itemCount: _sessions.length,
        itemBuilder: (context, index) => _SessionTile(session: _sessions[index]),
      ),
    );
  }

  String _periodLabel() {
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];
    return switch (_range) {
      _Range.day =>
        '${_anchor.day} ${months[_anchor.month - 1]} ${_anchor.year}',
      _Range.week =>
        '${_rangeStart.day}–${_rangeEnd.day} ${months[_rangeEnd.month - 1]}',
      _Range.month => '${months[_anchor.month - 1]} ${_anchor.year}',
    };
  }
}

class _SessionTile extends StatelessWidget {
  const _SessionTile({required this.session});

  final Map<String, dynamic> session;

  @override
  Widget build(BuildContext context) {
    final start = session['startsAt'] as String?;
    final end = session['endsAt'] as String?;
    final group =
        (session['group'] as Map?)?['name'] as String? ?? 'Занятие';
    final hall = (session['hall'] as Map?)?['name'] as String?;
    final status = session['status'] as String?;
    final cancelled = status == 'CANCELLED';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
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
                '${_time(start)}${end != null ? ' — ${_time(end)}' : ''}',
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
          if (hall != null) ...[
            const SizedBox(height: 2),
            Text(hall,
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          ],
        ],
      ),
    );
  }

  String _time(String? iso) {
    final date = iso == null ? null : DateTime.tryParse(iso)?.toLocal();
    if (date == null) {
      return '—';
    }
    return '${date.hour.toString().padLeft(2, '0')}:'
        '${date.minute.toString().padLeft(2, '0')}';
  }
}

/// Список из ответа API: клиент оборачивает массивы в `data`, а страницы —
/// отдают `items`. Один разбор на все экраны владельца.
List<Map<String, dynamic>> _listOf(Map<String, dynamic> response) {
  final raw = response['data'] ?? response['items'];
  if (raw is List) {
    return raw.whereType<Map<String, dynamic>>().toList();
  }
  return const [];
}