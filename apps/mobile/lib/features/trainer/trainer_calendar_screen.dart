import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../auth/auth_controller.dart';
import '../schedule/schedule_models.dart';
import 'trainer_calendar_controller.dart';

/// Календарь тренера: занятия всех групп по дням (H10).
class TrainerCalendarScreen extends StatefulWidget {
  const TrainerCalendarScreen({
    super.key,
    required this.auth,
    required this.controller,
  });

  final AuthController auth;
  final TrainerCalendarController controller;

  @override
  State<TrainerCalendarScreen> createState() => _TrainerCalendarScreenState();
}

class _TrainerCalendarScreenState extends State<TrainerCalendarScreen> {
  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final token = widget.auth.session?.accessToken;
    if (token != null) {
      widget.controller.load(token);
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
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.xl),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.cloud_off, size: 40, color: AppColors.textSecondary),
                  const SizedBox(height: AppSpacing.md),
                  Text(error, textAlign: TextAlign.center),
                  const SizedBox(height: AppSpacing.lg),
                  FilledButton.tonal(onPressed: _load, child: const Text('Повторить')),
                ],
              ),
            ),
          );
        }

        return RefreshIndicator(
          onRefresh: () async => _load(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.lg,
              AppSpacing.xxl,
            ),
            children: [
              Text('Календарь', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: AppSpacing.xs),
              const Text(
                'Две недели вперёд',
                style: TextStyle(color: AppColors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.lg),

              if (controller.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: AppSpacing.xxl),
                  child: Column(
                    children: [
                      Icon(Icons.event_busy, size: 36, color: AppColors.textSecondary),
                      SizedBox(height: AppSpacing.md),
                      Text(
                        'Занятий нет',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                      SizedBox(height: AppSpacing.sm),
                      Text(
                        'На ближайшие две недели занятий не запланировано.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                )
              else
                for (final day in controller.days) ...[
                  _DayHeader(date: day.date),
                  const SizedBox(height: AppSpacing.sm),
                  for (final session in day.sessions) ...[
                    _CalendarTile(session: session),
                    const SizedBox(height: AppSpacing.sm),
                  ],
                  const SizedBox(height: AppSpacing.md),
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
      style: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: AppColors.textSecondary,
      ),
    );
  }
}

class _CalendarTile extends StatelessWidget {
  const _CalendarTile({required this.session});

  final TrainingSession session;

  @override
  Widget build(BuildContext context) {
    final details = [
      session.groupName,
      if (session.hallName != null) session.hallName!,
    ].join(' · ');

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _time(session.startsAt),
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                _time(session.endsAt),
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
            ],
          ),
          const SizedBox(width: AppSpacing.lg),
          Expanded(
            child: Text(
              details,
              style: const TextStyle(fontSize: 14),
            ),
          ),
        ],
      ),
    );
  }
}

String _time(DateTime value) {
  return '${value.hour.toString().padLeft(2, '0')}:'
      '${value.minute.toString().padLeft(2, '0')}';
}
