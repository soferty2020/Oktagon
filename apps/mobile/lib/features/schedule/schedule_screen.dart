import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../attendance/attendance_repository.dart';
import '../auth/auth_controller.dart';
import 'schedule_controller.dart';
import 'schedule_models.dart';

/// Расписание группы выбранного спортсмена (H4), оформление по макету клуба.
///
/// Верхняя строка — дни, ниже — занятия выбранного дня. Переключатель
/// спортсмена здесь не дублируется: выбор один и тот же, на главной.
///
/// На будущем занятии можно предупредить об отсутствии (H6, BR-008): это
/// намерение родителя, итог подтверждает тренер отметкой.
class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({
    super.key,
    required this.auth,
    required this.controller,
    required this.attendance,
    required this.athleteId,
    required this.athleteName,
    required this.groupId,
    required this.refreshKey,
  });

  final AuthController auth;
  final ScheduleController controller;
  final AttendanceRepository attendance;

  /// Спортсмен, за которого можно предупредить об отсутствии.
  final String? athleteId;

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
  /// Выбранный пользователем день; `null` — день еще не выбран, показывается
  /// первый день с занятиями (или сегодня, если занятий нет).
  DateTime? _selectedDate;

  static DateTime _today() {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(ScheduleScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshKey != widget.refreshKey) {
      _selectedDate = null;
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

        final error = controller.error;
        if (error != null) {
          return _ErrorView(message: error, onRetry: _load);
        }

        if (controller.loading) {
          return const Center(child: CircularProgressIndicator());
        }

        if (widget.groupId == null) {
          return const _EmptyView(
            title: 'Группа не назначена',
            message: 'Когда спортсмена распределят в группу, здесь появится расписание.',
          );
        }

        // Две недели от сегодня: неделя может быть пустой из-за каникул, и
        // пользователь решил бы, что расписания нет вообще.
        final dates = List.generate(14, (index) => _today().add(Duration(days: index)));

        // Если сегодня занятий нет, открывается первый день с занятиями: пустой
        // экран при наличии расписания выглядел бы как ошибка. Выбор хранится в
        // поле, но вычисляется здесь без изменения состояния во время сборки.
        final effectiveDate = _selectedDate ??
            dates.firstWhere(
              (date) => _sessionsForDate(date).isNotEmpty,
              orElse: _today,
            );

        final selectedSessions = _sessionsForDate(effectiveDate);

        return ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.md,
            AppSpacing.lg,
            AppSpacing.xxl,
          ),
          children: [
            Text('Расписание', style: Theme.of(context).textTheme.headlineMedium),
            if (widget.athleteName.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                widget.athleteName,
                style: const TextStyle(color: AppColors.textSecondary),
              ),
            ],
            const SizedBox(height: AppSpacing.lg),

            _DateStrip(
              dates: dates,
              selected: effectiveDate,
              hasSessions: (date) => _sessionsForDate(date).isNotEmpty,
              onSelect: (date) => setState(() => _selectedDate = date),
            ),

            const SizedBox(height: AppSpacing.lg),

            if (selectedSessions.isEmpty)
              const _EmptyView(
                title: 'Занятий нет',
                message: 'В этот день тренировок нет. Выберите другой день.',
                compact: true,
              )
            else
              for (final session in selectedSessions) ...[
                _SessionTile(
                  session: session,
                  canReportAbsence: _canReportAbsence(session),
                  onReportAbsence: () => _reportAbsence(session),
                ),
                const SizedBox(height: AppSpacing.sm),
              ],
          ],
        );
      },
    );
  }

  List<TrainingSession> _sessionsForDate(DateTime date) {
    for (final day in widget.controller.days) {
      if (_sameDay(day.date, date)) {
        return day.sessions;
      }
    }
    return const [];
  }

  bool _sameDay(DateTime left, DateTime right) {
    return left.year == right.year && left.month == right.month && left.day == right.day;
  }

  /// Предупредить можно только о будущем занятии: писать «ребенка не будет» на
  /// прошедшую тренировку бессмысленно, а тренер уже поставил отметку.
  bool _canReportAbsence(TrainingSession session) {
    return widget.athleteId != null && session.startsAt.isAfter(DateTime.now());
  }

  Future<void> _reportAbsence(TrainingSession session) async {
    final token = widget.auth.session?.accessToken;
    final athleteId = widget.athleteId;
    if (token == null || athleteId == null) {
      return;
    }

    final reason = await showDialog<String?>(
      context: context,
      builder: (context) => const _AbsenceDialog(),
    );

    // null — диалог закрыт без отправки; пустая строка — «без причины».
    if (reason == null || !mounted) {
      return;
    }

    try {
      await widget.attendance.reportAbsence(
        token: token,
        sessionId: session.id,
        athleteId: athleteId,
        reason: reason,
      );

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Тренер увидит предупреждение в журнале занятия'),
        ),
      );
    } on Object {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось отправить предупреждение')),
      );
    }
  }
}

/// Полоса дат: день недели и число, выбранная — оранжевая.
class _DateStrip extends StatelessWidget {
  const _DateStrip({
    required this.dates,
    required this.selected,
    required this.hasSessions,
    required this.onSelect,
  });

  final List<DateTime> dates;
  final DateTime selected;
  final bool Function(DateTime) hasSessions;
  final ValueChanged<DateTime> onSelect;

  @override
  Widget build(BuildContext context) {
    const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

    return SizedBox(
      height: 80,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: dates.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (context, index) {
          final date = dates[index];
          final isSelected =
              date.year == selected.year &&
              date.month == selected.month &&
              date.day == selected.day;
          final hasAny = hasSessions(date);

          return Material(
            color: isSelected ? AppColors.accent : Colors.transparent,
            borderRadius: BorderRadius.circular(AppRadius.control),
            child: InkWell(
              onTap: () => onSelect(date),
              borderRadius: BorderRadius.circular(AppRadius.control),
              child: Container(
                width: 54,
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(AppRadius.control),
                  border: Border.all(
                    color: isSelected ? AppColors.accent : AppColors.divider,
                  ),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      weekdays[date.weekday - 1],
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: isSelected ? Colors.white : AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      '${date.day}',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: isSelected ? Colors.white : AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 3),
                    // Точка показывает, что в этот день есть занятия: иначе
                    // пришлось бы перебирать дни вручную.
                    Container(
                      width: 4,
                      height: 4,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: hasAny
                            ? (isSelected ? Colors.white : AppColors.accent)
                            : Colors.transparent,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Строка занятия: время слева, группа и место справа.
class _SessionTile extends StatelessWidget {
  const _SessionTile({
    required this.session,
    required this.canReportAbsence,
    required this.onReportAbsence,
  });

  final TrainingSession session;

  /// Предупреждение об отсутствии доступно только для будущего занятия.
  final bool canReportAbsence;
  final VoidCallback onReportAbsence;

  @override
  Widget build(BuildContext context) {
    final details = [
      if (session.hallName != null) session.hallName!,
      if (session.trainerName != null) session.trainerName!,
    ].join(' · ');

    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
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
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              Text(
                _time(session.endsAt),
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ),
          const SizedBox(width: AppSpacing.lg),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  session.groupName,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
                if (details.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    details,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (session.status == 'MOVED')
            const Tooltip(
              message: 'Занятие перенесено',
              child: Icon(Icons.swap_horiz, size: 18, color: AppColors.accent),
            ),
          if (canReportAbsence)
            IconButton(
              tooltip: 'Сообщить об отсутствии',
              onPressed: onReportAbsence,
              icon: const Icon(
                Icons.event_busy_outlined,
                size: 20,
                color: AppColors.textSecondary,
              ),
            ),
        ],
      ),
    );
  }
}

/// Диалог предупреждения об отсутствии (BR-008).
///
/// Причина необязательна: родитель может не хотеть объяснять, но тренеру она
/// полезна, чтобы отличить болезнь от поездки. Отмена возвращает `null`, отправка
/// без текста — пустую строку.
class _AbsenceDialog extends StatefulWidget {
  const _AbsenceDialog();

  @override
  State<_AbsenceDialog> createState() => _AbsenceDialogState();
}

class _AbsenceDialogState extends State<_AbsenceDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Ребенка не будет?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Тренер увидит предупреждение в журнале занятия. Итог он подтвердит отметкой.',
            style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _controller,
            autofocus: true,
            maxLength: 500,
            decoration: const InputDecoration(
              labelText: 'Причина (необязательно)',
              hintText: 'Например: болезнь или поездка',
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop<String?>(),
          child: const Text('Отмена'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(_controller.text),
          child: const Text('Сообщить'),
        ),
      ],
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView({
    required this.title,
    required this.message,
    this.compact = false,
  });

  final String title;
  final String message;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final content = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.event_busy, size: 36, color: AppColors.textSecondary),
        const SizedBox(height: AppSpacing.md),
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: AppSpacing.sm),
        Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(color: AppColors.textSecondary),
        ),
      ],
    );

    if (compact) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxl),
        child: content,
      );
    }
    return Center(
      child: Padding(padding: const EdgeInsets.all(AppSpacing.xl), child: content),
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
