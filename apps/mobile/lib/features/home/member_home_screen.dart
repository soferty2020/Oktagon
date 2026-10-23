import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../athletes/athlete_models.dart';
import '../athletes/belt_grades.dart';
import '../attendance/attendance_repository.dart';
import '../auth/auth_controller.dart';
import '../news/news_repository.dart';
import '../schedule/schedule_models.dart';
import 'member_home_controller.dart';

/// Главная участника клуба (H2–H3), оформление по макету клуба.
///
/// Состав: приветствие, переключатель спортсменов, оранжевая карточка ближайшей
/// тренировки, быстрые действия, посещаемость и последнее объявление.
/// Статус оплаты не показывается: финансы закрыты для участника (ADR-0013).
class MemberHomeContent extends StatefulWidget {
  const MemberHomeContent({
    super.key,
    required this.auth,
    required this.controller,
    this.onOpenSchedule,
    this.onOpenNews,
    this.onOpenAttendance,
    this.now = DateTime.now,
  });

  final AuthController auth;
  final MemberHomeController controller;

  /// Источник текущего времени: в golden-тестах подменяется, иначе скриншот
  /// зависит от дня запуска.
  final DateTime Function() now;

  /// Переходы на другие вкладки: быстрые действия дублируют нижнюю навигацию,
  /// но экономят один тап — по макету они и есть главный способ перехода.
  final VoidCallback? onOpenSchedule;
  final VoidCallback? onOpenNews;

  /// История посещений: отдельный экран, открывается с главной.
  final VoidCallback? onOpenAttendance;

  @override
  State<MemberHomeContent> createState() => _MemberHomeContentState();
}

class _MemberHomeContentState extends State<MemberHomeContent> {
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(MemberHomeContent oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.auth.session?.accessToken != widget.auth.session?.accessToken) {
      _load();
    }
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

        if (controller.loading && controller.athletes.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }

        final error = controller.error;
        if (error != null && controller.athletes.isEmpty) {
          return _ErrorState(message: error, onRetry: controller.retry);
        }

        if (controller.athletes.isEmpty) {
          return const _EmptyState(
            title: 'Нет связанных спортсменов',
            message: 'Попросите администратора клуба связать вашу учетную запись '
                'со спортсменом. После этого здесь появится расписание ребенка.',
          );
        }

        final user = widget.auth.user;

        return RefreshIndicator(
          onRefresh: controller.retry,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.lg,
              AppSpacing.xxl,
            ),
            children: [
              Text(
                'Привет, ${user?.firstName ?? ''}!',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: AppSpacing.lg),

              _AthleteSwitcher(
                athletes: controller.athletes,
                selected: controller.selected,
                onSelect: controller.select,
              ),

              if (controller.selected != null) ...[
                const SizedBox(height: AppSpacing.sm),
                _BeltLine(athlete: controller.selected!),
              ],

              if (error != null) ...[
                const SizedBox(height: AppSpacing.md),
                _InlineError(message: error, onRetry: controller.retry),
              ],

              const SizedBox(height: AppSpacing.lg),
              _NextSessionCard(
                session: controller.nextSession,
                onOpenSchedule: widget.onOpenSchedule,
                now: widget.now,
              ),

              const SizedBox(height: AppSpacing.lg),
              _QuickActions(
                onOpenSchedule: widget.onOpenSchedule,
                onOpenNews: widget.onOpenNews,
                onOpenAttendance: widget.onOpenAttendance,
                attendance: controller.attendance,
              ),

              const SizedBox(height: AppSpacing.xl),
              const _SectionHeader(title: 'Посещаемость', trailing: 'за месяц'),
              const SizedBox(height: AppSpacing.md),
              _AttendanceCard(attendance: controller.attendance),

              const SizedBox(height: AppSpacing.xl),
              _SectionHeader(
                title: 'Новости клуба',
                trailing: 'Все',
                onTrailingTap: widget.onOpenNews,
              ),
              const SizedBox(height: AppSpacing.md),
              _NewsCard(news: controller.latestNews, onOpenNews: widget.onOpenNews),
            ],
          ),
        );
      },
    );
  }
}

/// Пояс выбранного спортсмена (K3).
///
/// Показывается всегда: белый пояс — это ступень, с которой начинают, а не
/// отсутствие данных, поэтому скрывать строку нечего.
class _BeltLine extends StatelessWidget {
  const _BeltLine({required this.athlete});

  final LinkedAthlete athlete;

  @override
  Widget build(BuildContext context) {
    final description = beltDescription(athlete.beltGrade, athlete.beltAwardedAt);

    return Row(
      children: [
        const Icon(
          Icons.military_tech_outlined,
          size: 16,
          color: AppColors.textSecondary,
        ),
        const SizedBox(width: AppSpacing.xs),
        Text(
          description,
          style: const TextStyle(
            fontSize: 13,
            color: AppColors.textSecondary,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

/// Переключатель спортсменов (H2).
///
/// Показывается только если спортсменов больше одного: при одном выборе
/// переключатель занимал бы место зря.
class _AthleteSwitcher extends StatelessWidget {  const _AthleteSwitcher({
    required this.athletes,
    required this.selected,
    required this.onSelect,
  });

  final List<LinkedAthlete> athletes;
  final LinkedAthlete? selected;
  final Future<void> Function(LinkedAthlete) onSelect;

  @override
  Widget build(BuildContext context) {
    if (athletes.length == 1) {
      return const SizedBox.shrink();
    }

    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: [
        for (final athlete in athletes)
          _AthleteChip(
            athlete: athlete,
            selected: athlete.id == selected?.id,
            onTap: () => onSelect(athlete),
          ),
      ],
    );
  }
}

class _AthleteChip extends StatelessWidget {
  const _AthleteChip({
    required this.athlete,
    required this.selected,
    required this.onTap,
  });

  final LinkedAthlete athlete;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.accent : AppColors.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.pill),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.pill),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.sm,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.person,
                size: 16,
                color: selected ? Colors.white : AppColors.textSecondary,
              ),
              const SizedBox(width: AppSpacing.xs),
              Text(
                athlete.firstName.isEmpty ? athlete.lastName : athlete.firstName,
                style: TextStyle(
                  color: selected ? Colors.white : AppColors.textPrimary,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Карточка ближайшей тренировки — главный акцент экрана.
///
/// Оранжевая заливка и белый текст по макету: это самое важное, что участник
/// хочет узнать, открыв приложение.
class _NextSessionCard extends StatelessWidget {
  const _NextSessionCard({
    required this.session,
    this.onOpenSchedule,
    this.now = DateTime.now,
  });

  final TrainingSession? session;
  final VoidCallback? onOpenSchedule;

  /// Текущее время для подписи «Сегодня»/«Завтра».
  final DateTime Function() now;

  @override
  Widget build(BuildContext context) {
    final current = session;

    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.accent, Color(0xFFFF8A3D)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.sports_martial_arts, color: Colors.white, size: 18),
              const SizedBox(width: AppSpacing.sm),
              Text(
                'Следующая тренировка',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.9),
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const Spacer(),
              if (current != null)
                TextButton(
                  onPressed: onOpenSchedule,
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                    minimumSize: const Size(0, 0),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('Все', style: TextStyle(fontSize: 13)),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          if (current == null)
            const Text(
              'Занятий пока нет. Когда расписание появится, тренировка будет здесь.',
              style: TextStyle(color: Colors.white, fontSize: 15, height: 1.35),
            )
          else ...[
            Text(
              _relativeDay(current.startsAt, now: now()),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w700,
                height: 1.2,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              '${_time(current.startsAt)} — ${_time(current.endsAt)}',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w700,
                height: 1.2,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              [
                current.groupName,
                if (current.hallName != null) current.hallName!,
                if (current.trainerName != null) 'Тренер ${current.trainerName!}',
              ].join(' · '),
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.92),
                fontSize: 14,
                height: 1.35,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Быстрые действия: расписание, посещаемость, новости.
///
/// Оплаты из макета нет: финансовые данные закрыты для участника (ADR-0013).
/// Неработающая кнопка хуже её отсутствия.
class _QuickActions extends StatelessWidget {
  const _QuickActions({
    this.onOpenSchedule,
    this.onOpenNews,
    this.onOpenAttendance,
    required this.attendance,
  });

  final VoidCallback? onOpenSchedule;
  final VoidCallback? onOpenNews;
  final VoidCallback? onOpenAttendance;
  final AthleteAttendance? attendance;

  @override
  Widget build(BuildContext context) {
    final percent = attendance?.percent;

    return Row(
      children: [
        _QuickAction(
          icon: Icons.calendar_month_outlined,
          label: 'Расписание',
          onTap: onOpenSchedule,
        ),
        const SizedBox(width: AppSpacing.sm),
        _QuickAction(
          icon: Icons.check_circle_outline,
          label: 'Посещаемость',
          badge: percent == null ? null : '$percent%',
          // Ведет в историю посещений: процент без дат не отвечает на вопрос
          // «был ли ребенок 12 ноября».
          onTap: onOpenAttendance,
        ),
        const SizedBox(width: AppSpacing.sm),
        _QuickAction(
          icon: Icons.campaign_outlined,
          label: 'Новости',
          onTap: onOpenNews,
        ),
      ],
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.label,
    this.badge,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final String? badge;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(AppRadius.card),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.card),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              vertical: AppSpacing.lg,
              horizontal: AppSpacing.sm,
            ),
            child: Column(
              children: [
                SizedBox(
                  height: 20,
                  child: badge == null
                      ? null
                      : Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: AppSpacing.sm,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.accent,
                            borderRadius: BorderRadius.circular(AppRadius.chip),
                          ),
                          child: Text(
                            badge!,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Icon(icon, size: 24, color: AppColors.textPrimary),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  label,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textPrimary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Посещаемость за месяц: процент от отмеченных занятий.
class _AttendanceCard extends StatelessWidget {
  const _AttendanceCard({required this.attendance});

  final AthleteAttendance? attendance;

  @override
  Widget build(BuildContext context) {
    final summary = attendance;

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
          if (summary == null)
            const Text(
              'Пока нет отмеченных занятий.',
              style: TextStyle(color: AppColors.textSecondary),
            )
          else
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  summary.percent == null ? '—' : '${summary.percent}%',
                  style: const TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                    color: AppColors.textPrimary,
                    height: 1,
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    'был ${summary.present} из ${summary.total}',
                    style: const TextStyle(color: AppColors.textSecondary),
                  ),
                ),
              ],
            ),
          if (summary != null) ...[
            const SizedBox(height: AppSpacing.md),
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadius.pill),
              child: LinearProgressIndicator(
                value: summary.marked == 0 ? 0 : summary.present / summary.marked,
                minHeight: 8,
                backgroundColor: AppColors.surfaceMuted,
                valueColor: const AlwaysStoppedAnimation(AppColors.accent),
              ),
            ),
            if (summary.unmarked > 0) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Без отметки: ${summary.unmarked}',
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

/// Последнее объявление клуба.
class _NewsCard extends StatelessWidget {
  const _NewsCard({required this.news, this.onOpenNews});

  final NewsPost? news;
  final VoidCallback? onOpenNews;

  @override
  Widget build(BuildContext context) {
    final post = news;

    return Material(
      color: AppColors.background,
      borderRadius: BorderRadius.circular(AppRadius.card),
      child: InkWell(
        onTap: post == null ? null : onOpenNews,
        borderRadius: BorderRadius.circular(AppRadius.card),
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.card),
            border: Border.all(color: AppColors.divider),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (post == null)
                const Text(
                  'Объявлений пока нет.',
                  style: TextStyle(color: AppColors.textSecondary),
                )
              else ...[
                Row(
                  children: [
                    if (post.isPinned) ...[
                      const Icon(Icons.push_pin, size: 14, color: AppColors.accent),
                      const SizedBox(width: AppSpacing.xs),
                    ],
                    Expanded(
                      child: Text(
                        post.title,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  post.body,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    height: 1.4,
                  ),
                ),
                if (post.publishedAt != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    _shortDate(post.publishedAt!),
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textTertiary,
                    ),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Заголовок секции с необязательной ссылкой «Все».
class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.trailing, this.onTrailingTap});

  final String title;
  final String? trailing;
  final VoidCallback? onTrailingTap;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(title, style: Theme.of(context).textTheme.titleLarge),
        ),
        if (trailing != null)
          TextButton(
            onPressed: onTrailingTap,
            style: TextButton.styleFrom(
              padding: EdgeInsets.zero,
              minimumSize: const Size(0, 0),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(
              trailing!,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
            ),
          ),
      ],
    );
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppRadius.control),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: AppColors.danger, fontSize: 13),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Повторить')),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

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

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.person_outline, size: 40, color: AppColors.textSecondary),
            const SizedBox(height: AppSpacing.md),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpacing.sm),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

/// «Сегодня», «Завтра» или дата с днем недели.
String _relativeDay(DateTime value, {DateTime? now}) {
  final current = now ?? DateTime.now();
  final today = DateTime(current.year, current.month, current.day);
  final day = DateTime(value.year, value.month, value.day);
  final difference = day.difference(today).inDays;

  if (difference == 0) {
    return 'Сегодня';
  }
  if (difference == 1) {
    return 'Завтра';
  }

  const weekdays = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  return '${value.day}.${value.month.toString().padLeft(2, '0')}, '
      '${weekdays[value.weekday - 1]}';
}

String _time(DateTime value) {
  return '${value.hour.toString().padLeft(2, '0')}:'
      '${value.minute.toString().padLeft(2, '0')}';
}

String _shortDate(DateTime value) {
  return '${value.day}.${value.month.toString().padLeft(2, '0')}.${value.year}';
}
