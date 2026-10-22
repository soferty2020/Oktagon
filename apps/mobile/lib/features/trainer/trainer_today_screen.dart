import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../auth/auth_controller.dart';
import '../schedule/schedule_models.dart';
import 'attendance_controller.dart';
import 'attendance_screen.dart';
import 'trainer_day_controller.dart';

/// Экран «Сегодня» тренера (H10).
///
/// Сводка и занятия на сегодня с переходом к отметке посещаемости. Это главный
/// экран тренера: он открывает его перед занятием, а не расписание на месяц.
class TrainerTodayScreen extends StatefulWidget {
  const TrainerTodayScreen({
    super.key,
    required this.auth,
    required this.controller,
    required this.attendanceFactory,
  });

  final AuthController auth;
  final TrainerDayController controller;

  /// Журнал создается на каждое занятие: держать одно состояние на все занятия
  /// нельзя — тренер может открыть второе, не сохранив первое.
  final AttendanceController Function() attendanceFactory;

  @override
  State<TrainerTodayScreen> createState() => _TrainerTodayScreenState();
}

class _TrainerTodayScreenState extends State<TrainerTodayScreen> {
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

  Future<void> _openAttendance(TrainingSession session) async {
    final token = widget.auth.session?.accessToken;
    if (token == null) {
      return;
    }

    final controller = widget.attendanceFactory();
    await controller.load(token: token, sessionId: session.id);

    if (!mounted) {
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => AttendanceScreen(
          auth: widget.auth,
          controller: controller,
          session: session,
        ),
      ),
    );

    // После возврата данные перезагружаются: количество отмеченных могло
    // измениться, и сводка должна это показать.
    if (mounted) {
      _load();
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
          return _ErrorView(message: error, onRetry: _retry);
        }

        return RefreshIndicator(
          onRefresh: () async => _retry(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.lg,
              AppSpacing.xxl,
            ),
            children: [
              Text('Сегодня', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: AppSpacing.lg),

              Row(
                children: [
                  _StatCard(
                    icon: Icons.event_available,
                    value: '${controller.sessionsCount}',
                    label: 'занятий',
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  _StatCard(
                    icon: Icons.groups_outlined,
                    value: '${controller.groupsCount}',
                    label: 'групп',
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  _StatCard(
                    icon: Icons.people_outline,
                    value: '${controller.studentsCount}',
                    label: 'учеников',
                  ),
                ],
              ),

              const SizedBox(height: AppSpacing.xl),
              Text(
                'Занятия на сегодня',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: AppSpacing.md),

              if (controller.todaySessions.isEmpty)
                const _EmptyToday()
              else
                for (final session in controller.todaySessions) ...[
                  _SessionCard(
                    session: session,
                    onAttendance: () => _openAttendance(session),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                ],
            ],
          ),
        );
      },
    );
  }

  Future<void> _retry() => widget.controller.retry();
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.icon,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: AppColors.surfaceMuted,
          borderRadius: BorderRadius.circular(AppRadius.card),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: AppColors.accent),
            const SizedBox(height: AppSpacing.sm),
            Text(
              value,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                height: 1,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SessionCard extends StatelessWidget {
  const _SessionCard({required this.session, required this.onAttendance});

  final TrainingSession session;
  final VoidCallback onAttendance;

  @override
  Widget build(BuildContext context) {
    final details = [
      if (session.hallName != null) session.hallName!,
    ].join(' · ');

    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                '${_time(session.startsAt)} — ${_time(session.endsAt)}',
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              if (details.isNotEmpty)
                Text(
                  details,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.textSecondary,
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            session.groupName,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: AppSpacing.md),
          FilledButton.tonalIcon(
            onPressed: onAttendance,
            icon: const Icon(Icons.checklist, size: 18),
            label: const Text('Отметить посещаемость'),
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(44),
              backgroundColor: AppColors.accentSoft,
              foregroundColor: AppColors.accent,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyToday extends StatelessWidget {
  const _EmptyToday();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxl),
      child: Column(
        children: [
          const Icon(Icons.event_available, size: 36, color: AppColors.textSecondary),
          const SizedBox(height: AppSpacing.md),
          Text(
            'Сегодня занятий нет',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.sm),
          const Text(
            'Расписание на другие дни — в разделе «Календарь».',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.cloud_off, size: 40, color: AppColors.textSecondary),
            const SizedBox(height: AppSpacing.md),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: AppSpacing.lg),
            FilledButton.tonal(onPressed: onRetry, child: const Text('Повторить')),
          ],
        ),
      ),
    );
  }
}

String _time(DateTime value) {
  return '${value.hour.toString().padLeft(2, '0')}:'
      '${value.minute.toString().padLeft(2, '0')}';
}
