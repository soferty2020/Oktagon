import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import 'schedule_controller.dart';
import 'schedule_models.dart';

/// Расписание группы выбранного спортсмена (H4).
///
/// Показывает занятия по дням. Переключатель спортсмена здесь не дублируется: он
/// на главной, и это один и тот же выбор — второй переключатель на втором экране
/// сбивал бы с толку.
class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({
    super.key,
    required this.auth,
    required this.controller,
    required this.athleteName,
    required this.groupId,
    required this.refreshKey,
  });

  final AuthController auth;
  final ScheduleController controller;

  /// Имя выбранного спортсмена: по нему видно, чье расписание открыто.
  final String athleteName;

  /// Группа выбранного спортсмена; `null`, если группы нет.
  final String? groupId;

  /// Меняется при смене спортсмена: расписание перезагружается.
  final String refreshKey;

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen> {
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(ScheduleScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshKey != widget.refreshKey) {
      _load();
    }
  }

  void _load() {
    final token = widget.auth.session?.accessToken;
    if (token != null) {
      widget.controller.load(token: token, groupId: widget.groupId);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final controller = widget.controller;

        if (controller.loading) {
          return const Center(child: CircularProgressIndicator());
        }

        final error = controller.error;
        if (error != null) {
          return _ErrorView(message: error, onRetry: _load);
        }

        if (widget.groupId == null) {
          return const _EmptyView(
            title: 'Группа не назначена',
            message: 'Когда спортсмена распределят в группу, здесь появится расписание.',
          );
        }

        if (controller.isEmpty) {
          return const _EmptyView(
            title: 'Занятий нет',
            message: 'На ближайший месяц занятий не запланировано. '
                'Если расписание должно быть, уточните у администратора клуба.',
          );
        }

        return RefreshIndicator(
          onRefresh: () async => _load(),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                'Расписание · ${widget.athleteName}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              for (final day in controller.days) ...[
                _DayHeader(date: day.date),
                const SizedBox(height: 8),
                for (final session in day.sessions) ...[
                  _SessionTile(session: session),
                  const SizedBox(height: 8),
                ],
                const SizedBox(height: 12),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _DayHeader extends StatelessWidget {
  const _DayHeader({required this.date});

  final DateTime date;

  @override
  Widget build(BuildContext context) {
    const weekdays = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

    return Text(
      '${weekdays[date.weekday - 1]}, ${date.day}.${date.month.toString().padLeft(2, '0')}',
      style: Theme.of(context).textTheme.titleSmall?.copyWith(
            color: const Color(0xFF666666),
            fontWeight: FontWeight.w600,
          ),
    );
  }
}

class _SessionTile extends StatelessWidget {
  const _SessionTile({required this.session});

  final TrainingSession session;

  @override
  Widget build(BuildContext context) {
    final details = [
      session.groupName,
      if (session.hallName != null) session.hallName!,
      if (session.trainerName != null) session.trainerName!,
    ].join(' · ');

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _time(session.startsAt),
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                Text(
                  _time(session.endsAt),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: const Color(0xFF888888),
                      ),
                ),
              ],
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                details,
                style: const TextStyle(color: Color(0xFF444444)),
              ),
            ),
            if (session.status == 'MOVED')
              const Tooltip(
                message: 'Занятие перенесено',
                child: Icon(Icons.swap_horiz, size: 18, color: Color(0xFFF26522)),
              ),
          ],
        ),
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.event_busy, size: 40, color: Color(0xFF888888)),
            const SizedBox(height: 12),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Color(0xFF666666)),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.cloud_off, size: 40, color: Color(0xFF888888)),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.tonal(onPressed: onRetry, child: const Text('Повторить')),
          ],
        ),
      ),
    );
  }
}

String _time(DateTime value) {
  return '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
}
