import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../auth/auth_controller.dart';
import '../schedule/schedule_models.dart';
import 'attendance_controller.dart';
import 'trainer_models.dart';

/// Журнал посещаемости занятия (H10).
///
/// Три состояния на спортсмена: был, не был, уважительная причина. Отметка
/// ставится одним нажатием, сохранение — отдельной кнопкой: тренер ведет занятие
/// и отмечает по ходу, а не заполняет форму целиком.
class AttendanceScreen extends StatelessWidget {
  const AttendanceScreen({
    super.key,
    required this.auth,
    required this.controller,
    required this.session,
  });

  final AuthController auth;
  final AttendanceController controller;
  final TrainingSession session;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        return Scaffold(
          appBar: AppBar(
            title: Text(session.groupName),
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => Navigator.of(context).maybePop(),
            ),
          ),
          body: SafeArea(
            child: controller.loading
                ? const Center(child: CircularProgressIndicator())
                : _buildBody(context),
          ),
          bottomNavigationBar: _buildSaveBar(context),
        );
      },
    );
  }

  Widget _buildBody(BuildContext context) {
    final journal = controller.journal;

    if (controller.error != null && journal == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.cloud_off, size: 40, color: AppColors.textSecondary),
              const SizedBox(height: AppSpacing.md),
              Text(controller.error!, textAlign: TextAlign.center),
              const SizedBox(height: AppSpacing.lg),
              FilledButton.tonal(
                onPressed: () {
                  final token = auth.session?.accessToken;
                  if (token != null) {
                    controller.load(token: token, sessionId: session.id);
                  }
                },
                child: const Text('Повторить'),
              ),
            ],
          ),
        ),
      );
    }

    if (journal == null || journal.roster.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(AppSpacing.xl),
          child: Text(
            'В группе пока нет спортсменов: отмечать некого.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textSecondary),
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.xxl,
      ),
      children: [
        Text(
          '${_time(journal.startsAt)} — ${_time(journal.startsAt.add(const Duration(minutes: 90)))}',
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: AppColors.textSecondary,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          'Отмечено ${journal.markedCount} из ${journal.roster.length}',
          style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
        ),
        const SizedBox(height: AppSpacing.lg),

        for (final entry in journal.roster) ...[
          _RosterTile(
            entry: entry,
            state: controller.stateFor(entry.athleteId),
            onChanged: (state) => controller.setState(entry.athleteId, state),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
      ],
    );
  }

  Widget _buildSaveBar(BuildContext context) {
    final hasChanges = controller.hasChanges;
    final message = controller.savedMessage;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: const BoxDecoration(
        color: AppColors.background,
        border: Border(top: BorderSide(color: AppColors.divider)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (controller.error != null && controller.journal != null)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: Text(
                controller.error!,
                style: const TextStyle(color: AppColors.danger, fontSize: 13),
              ),
            ),
          if (message != null)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: Text(
                message,
                style: const TextStyle(color: AppColors.success, fontSize: 13),
              ),
            ),
          FilledButton(
            onPressed: hasChanges && !controller.saving ? _save : null,
            child: controller.saving
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : Text(hasChanges ? 'Сохранить' : 'Нет изменений'),
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    final token = auth.session?.accessToken;
    if (token != null) {
      await controller.save(token: token);
    }
  }
}

class _RosterTile extends StatelessWidget {
  const _RosterTile({
    required this.entry,
    required this.state,
    required this.onChanged,
  });

  final RosterEntry entry;
  final AttendanceState state;
  final ValueChanged<AttendanceState> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
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
              Expanded(
                child: Text(
                  entry.displayName,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
              _MarkButton(
                icon: Icons.check,
                color: AppColors.success,
                selected: state == AttendanceState.present,
                tooltip: 'Был',
                onTap: () => onChanged(AttendanceState.present),
              ),
              const SizedBox(width: AppSpacing.xs),
              _MarkButton(
                icon: Icons.close,
                color: AppColors.danger,
                selected: state == AttendanceState.absent,
                tooltip: 'Не был',
                onTap: () => onChanged(AttendanceState.absent),
              ),
              const SizedBox(width: AppSpacing.xs),
              _MarkButton(
                icon: Icons.info_outline,
                color: AppColors.warning,
                selected: state == AttendanceState.excused,
                tooltip: 'Уважительная причина',
                onTap: () => onChanged(AttendanceState.excused),
              ),
            ],
          ),
          if (entry.plannedAbsenceReason != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Родитель предупредил: ${entry.plannedAbsenceReason}',
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
          ],
        ],
      ),
    );
  }
}

class _MarkButton extends StatelessWidget {
  const _MarkButton({
    required this.icon,
    required this.color,
    required this.selected,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final bool selected;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.control),
        child: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: selected ? color : Colors.transparent,
            borderRadius: BorderRadius.circular(AppRadius.control),
            border: Border.all(color: selected ? color : AppColors.divider),
          ),
          child: Icon(
            icon,
            size: 18,
            color: selected ? Colors.white : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

String _time(DateTime value) {
  return '${value.hour.toString().padLeft(2, '0')}:'
      '${value.minute.toString().padLeft(2, '0')}';
}
