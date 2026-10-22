import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../auth/auth_controller.dart';
import 'attendance_history_controller.dart';
import 'attendance_repository.dart';

/// История посещений спортсмена (H5).
///
/// Сводка сверху отвечает «сколько», список ниже — «когда». Одно без другого
/// бесполезно: процент не показывает, был ли ребенок на конкретном занятии, а
/// список без сводки заставляет считать вручную.
class AttendanceHistoryScreen extends StatefulWidget {
  const AttendanceHistoryScreen({
    super.key,
    required this.auth,
    required this.controller,
    required this.athleteId,
    required this.athleteName,
  });

  final AuthController auth;
  final AttendanceHistoryController controller;
  final String athleteId;
  final String athleteName;

  @override
  State<AttendanceHistoryScreen> createState() => _AttendanceHistoryScreenState();
}

class _AttendanceHistoryScreenState extends State<AttendanceHistoryScreen> {
  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final token = widget.auth.session?.accessToken;
    if (token != null) {
      widget.controller.load(token: token, athleteId: widget.athleteId);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Посещаемость'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        child: ListenableBuilder(
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
                      FilledButton.tonal(
                        onPressed: _load,
                        child: const Text('Повторить'),
                      ),
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
                  if (widget.athleteName.isNotEmpty) ...[
                    Text(
                      widget.athleteName,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],

                  _SummaryCard(controller: controller),
                  const SizedBox(height: AppSpacing.xl),

                  Text(
                    'История за 3 месяца',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: AppSpacing.md),

                  if (controller.records.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: AppSpacing.xxl),
                      child: Column(
                        children: [
                          Icon(Icons.event_busy, size: 36, color: AppColors.textSecondary),
                          SizedBox(height: AppSpacing.md),
                          Text(
                            'Отметок пока нет',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                          ),
                          SizedBox(height: AppSpacing.sm),
                          Text(
                            'Когда тренер отметит посещение, оно появится здесь.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: AppColors.textSecondary),
                          ),
                        ],
                      ),
                    )
                  else
                    for (final record in controller.records) ...[
                      _RecordTile(record: record),
                      const SizedBox(height: AppSpacing.sm),
                    ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.controller});

  final AttendanceHistoryController controller;

  @override
  Widget build(BuildContext context) {
    final percent = controller.percent;

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
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                percent == null ? '—' : '$percent%',
                style: const TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  height: 1,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  'из ${controller.total} отмеченных',
                  style: const TextStyle(color: AppColors.textSecondary),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              _CountChip(
                label: 'был',
                value: controller.present,
                color: AppColors.success,
              ),
              const SizedBox(width: AppSpacing.sm),
              _CountChip(
                label: 'не был',
                value: controller.absent,
                color: AppColors.danger,
              ),
              const SizedBox(width: AppSpacing.sm),
              _CountChip(
                label: 'уважительная',
                value: controller.excused,
                color: AppColors.warning,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CountChip extends StatelessWidget {
  const _CountChip({required this.label, required this.value, required this.color});

  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.sm,
        ),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(AppRadius.control),
        ),
        child: Column(
          children: [
            Text(
              '$value',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

class _RecordTile extends StatelessWidget {
  const _RecordTile({required this.record});

  final AttendanceRecord record;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (record.status) {
      AttendanceRecordStatus.present => (Icons.check, AppColors.success),
      AttendanceRecordStatus.absent => (Icons.close, AppColors.danger),
      AttendanceRecordStatus.excused => (Icons.info_outline, AppColors.warning),
    };

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppRadius.control),
            ),
            child: Icon(icon, size: 18, color: color),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _formatDate(record.startsAt),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 2),
                Text(
                  record.groupName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
                if (record.comment != null && record.comment!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    record.comment!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(
            record.status.label,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color),
          ),
        ],
      ),
    );
  }
}

String _formatDate(DateTime value) {
  const weekdays = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  return '${value.day}.${value.month.toString().padLeft(2, '0')}.${value.year}, '
      '${weekdays[value.weekday - 1]} · '
      '${value.hour.toString().padLeft(2, '0')}:'
      '${value.minute.toString().padLeft(2, '0')}';
}
