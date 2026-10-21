import 'package:flutter/material.dart';

import '../athletes/athlete_models.dart';
import '../attendance/attendance_repository.dart';
import '../auth/auth_controller.dart';
import '../news/news_repository.dart';
import '../schedule/schedule_models.dart';
import 'member_home_controller.dart';

/// Главная участника клуба (H2–H3).
///
/// Состав по `docs/10-mobile-app.md`: переключатель спортсменов, ближайшая
/// тренировка, посещаемость, последнее объявление. Статус оплаты не
/// показывается: финансовые данные закрыты для участника (ADR-0013), и это
/// отмечено как открытый вопрос в `docs/25-open-questions.md`.
///
/// `Scaffold` не создается: экран живет внутри `MemberShell` с нижней
/// навигацией, и вложенный `Scaffold` дал бы вторую панель приложения.
class MemberHomeContent extends StatefulWidget {
  const MemberHomeContent({
    super.key,
    required this.auth,
    required this.controller,
  });

  final AuthController auth;
  final MemberHomeController controller;

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
    // Токен меняется после повторного входа: данные нужно загрузить заново,
    // иначе на экране останутся чужие.
    if (oldWidget.auth.session?.accessToken != widget.auth.session?.accessToken) {
      _load();
    }
  }

  void _load() {
    final token = widget.auth.session?.accessToken;
    if (token != null) {
      // Игнорируется намеренно: результат отражается в состоянии контроллера,
      // а не в возвращаемом значении.
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

        return RefreshIndicator(
          onRefresh: controller.retry,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _AthleteSwitcher(
                athletes: controller.athletes,
                selected: controller.selected,
                onSelect: controller.select,
              ),
              if (error != null) ...[
                const SizedBox(height: 12),
                _InlineError(message: error, onRetry: controller.retry),
              ],
              const SizedBox(height: 16),
              _NextSessionCard(
                session: controller.nextSession,
                groupName: controller.group?.name,
              ),
              const SizedBox(height: 12),
              _AttendanceCard(
                attendance: controller.attendance,
              ),
              const SizedBox(height: 12),
              _NewsCard(news: controller.latestNews),
            ],
          ),
        );
      },
    );
  }
}

/// Переключатель спортсменов (H2).
///
/// Показывается только если спортсменов больше одного: при одном выборе
/// переключатель был бы лишним элементом, занимающим место на экране.
class _AthleteSwitcher extends StatelessWidget {
  const _AthleteSwitcher({
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
      return _AthleteHeader(athlete: athletes.first);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Спортсмен',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: const Color(0xFF888888),
              ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final athlete in athletes)
              ChoiceChip(
                label: Text(athlete.firstName.isEmpty ? athlete.lastName : athlete.firstName),
                selected: athlete.id == selected?.id,
                onSelected: (_) => onSelect(athlete),
              ),
          ],
        ),
        if (selected != null) ...[
          const SizedBox(height: 8),
          _AthleteHeader(athlete: selected!, compact: true),
        ],
      ],
    );
  }
}

class _AthleteHeader extends StatelessWidget {
  const _AthleteHeader({required this.athlete, this.compact = false});

  final LinkedAthlete athlete;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        CircleAvatar(
          radius: compact ? 16 : 22,
          backgroundColor: Theme.of(context).colorScheme.primaryContainer,
          child: Text(
            athlete.firstName.isEmpty ? '?' : athlete.firstName.characters.first,
            style: TextStyle(fontSize: compact ? 13 : 18),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                athlete.displayName,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (!athlete.isActive)
                Text(
                  _statusLabel(athlete.status),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: const Color(0xFFB3261E),
                      ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  String _statusLabel(String status) {
    return switch (status) {
      'FROZEN' => 'заморожен',
      'ARCHIVED' => 'архив',
      _ => 'активен',
    };
  }
}

/// Ближайшая тренировка.
class _NextSessionCard extends StatelessWidget {
  const _NextSessionCard({required this.session, required this.groupName});

  final TrainingSession? session;
  final String? groupName;

  @override
  Widget build(BuildContext context) {
    final current = session;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Ближайшая тренировка',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: const Color(0xFF888888),
                  ),
            ),
            const SizedBox(height: 8),
            if (current == null)
              const Text(
                'Занятий пока нет. Когда расписание появится, тренировка будет здесь.',
                style: TextStyle(color: Color(0xFF666666)),
              )
            else ...[
              Text(
                _formatDay(current.startsAt),
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                '${_formatTime(current.startsAt)} — ${_formatTime(current.endsAt)}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Text(
                [
                  current.groupName,
                  if (current.hallName != null) current.hallName!,
                  if (current.trainerName != null) 'тренер ${current.trainerName!}',
                ].join(' · '),
                style: const TextStyle(color: Color(0xFF666666)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Посещаемость за текущий месяц.
class _AttendanceCard extends StatelessWidget {
  const _AttendanceCard({required this.attendance});

  final AthleteAttendance? attendance;

  @override
  Widget build(BuildContext context) {
    final summary = attendance;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Посещаемость за месяц',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: const Color(0xFF888888),
                  ),
            ),
            const SizedBox(height: 8),
            if (summary == null)
              const Text(
                'Пока нет отмеченных занятий.',
                style: TextStyle(color: Color(0xFF666666)),
              )
            else
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    summary.percent == null ? '—' : '${summary.percent}%',
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(width: 12),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Text(
                      'был ${summary.present} из ${summary.total}',
                      style: const TextStyle(color: Color(0xFF666666)),
                    ),
                  ),
                ],
              ),
            if (summary != null && summary.unmarked > 0) ...[
              const SizedBox(height: 4),
              Text(
                'Без отметки: ${summary.unmarked}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: const Color(0xFF888888),
                    ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Последнее объявление клуба.
class _NewsCard extends StatelessWidget {
  const _NewsCard({required this.news});

  final NewsPost? news;

  @override
  Widget build(BuildContext context) {
    final post = news;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  'Объявление',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: const Color(0xFF888888),
                      ),
                ),
                if (post != null && post.isPinned) ...[
                  const SizedBox(width: 8),
                  const Icon(Icons.push_pin, size: 14, color: Color(0xFFF26522)),
                ],
              ],
            ),
            const SizedBox(height: 8),
            if (post == null)
              const Text(
                'Объявлений пока нет.',
                style: TextStyle(color: Color(0xFF666666)),
              )
            else ...[
              Text(
                post.title,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 4),
              Text(
                post.body,
                maxLines: 4,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Color(0xFF666666)),
              ),
            ],
          ],
        ),
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
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.cloud_off, size: 40, color: Color(0xFF888888)),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.tonal(
              onPressed: onRetry,
              child: const Text('Повторить'),
            ),
          ],
        ),
      ),
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
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFEDED),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: Color(0xFFB3261E), fontSize: 13),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Повторить')),
        ],
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
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.person_outline, size: 40, color: Color(0xFF888888)),
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

String _formatDay(DateTime value) {
  const weeks = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  final week = weeks[value.weekday - 1];
  return '${value.day}.${value.month.toString().padLeft(2, '0')}, $week';
}

String _formatTime(DateTime value) {
  return '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
}
