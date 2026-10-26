import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../auth/auth_controller.dart';
import 'sports_controller.dart';
import 'sports_models.dart';

/// Экран «Спорт»: аттестации и соревнования ребёнка (#41).
///
/// Записи на мероприятия здесь нет — родитель только смотрит. Результаты
/// появляются после публикации: сервер не отдаёт их раньше, и экран не пытается
/// угадать статус сам.
class SportsScreen extends StatefulWidget {
  const SportsScreen({super.key, required this.auth, required this.controller});

  final AuthController auth;
  final SportsController controller;

  @override
  State<SportsScreen> createState() => _SportsScreenState();
}

class _SportsScreenState extends State<SportsScreen> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChanged);
    final token = widget.auth.session?.accessToken;
    if (token != null) {
      widget.controller.load(token);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onChanged);
    super.dispose();
  }

  void _onChanged() {
    if (mounted) {
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final athletes = controller.athletes;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Спорт'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Обновить',
            onPressed: () {
              final token = widget.auth.session?.accessToken;
              if (token != null) {
                controller.load(token);
              }
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          final token = widget.auth.session?.accessToken;
          if (token != null) {
            await controller.load(token);
          }
        },
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            if (athletes.length > 1) _AthleteSwitcher(controller: controller, athletes: athletes),
            if (controller.loading) const Padding(
              padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
              child: Center(child: CircularProgressIndicator()),
            ) else if (controller.error != null)
              _Message(text: controller.error!, icon: Icons.error_outline)
            else if (controller.attestations.isEmpty && controller.competitions.isEmpty)
              const _Message(
                text: 'Мероприятий пока нет. Когда тренер запишет ребёнка на аттестацию или турнир, они появятся здесь.',
                icon: Icons.sports_martial_arts,
              )
            else ...[
              if (controller.attestations.isNotEmpty) ...[
                const _SectionTitle('Аттестации'),
                ...controller.attestations.map(_AttestationCard.new),
              ],
              if (controller.competitions.isNotEmpty) ...[
                const _SectionTitle('Соревнования'),
                ...controller.competitions.map(_CompetitionCard.new),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _AthleteSwitcher extends StatelessWidget {
  const _AthleteSwitcher({required this.controller, required this.athletes});

  final SportsController controller;
  final List<({String id, String name})> athletes;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: [
          ChoiceChip(
            label: const Text('Все дети'),
            selected: controller.selectedAthleteId == null,
            onSelected: (_) => controller.selectAthlete(null),
          ),
          ...athletes.map(
            (athlete) => ChoiceChip(
              label: Text(athlete.name),
              selected: controller.selectedAthleteId == athlete.id,
              onSelected: (_) => controller.selectAthlete(athlete.id),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.md, bottom: AppSpacing.sm),
      child: Text(
        text,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _AttestationCard extends StatelessWidget {
  const _AttestationCard(this.item);

  final MeAttestation item;

  @override
  Widget build(BuildContext context) {
    final admission = switch (item.admission) {
      'ADMITTED' => 'Допущен',
      'REJECTED' => 'Не допущен',
      _ => 'Допуск не подтверждён',
    };
    final payment = item.paymentStatus == 'PAID' ? 'Оплачено' : 'Не оплачено';

    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(item.title, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: AppSpacing.xs),
            Text('${_formatDate(item.scheduledAt)} · ${item.athleteName}'),
            if (item.location != null) Text(item.location!),
            const SizedBox(height: AppSpacing.xs),
            Text('$admission · $payment'),
            if (item.resultsPublished && item.resultLabel != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: Text(
                  item.resultLabel!,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              )
            else
              const Padding(
                padding: EdgeInsets.only(top: AppSpacing.xs),
                child: Text('Результаты появятся после публикации'),
              ),
          ],
        ),
      ),
    );
  }
}

class _CompetitionCard extends StatelessWidget {
  const _CompetitionCard(this.item);

  final MeCompetition item;

  @override
  Widget build(BuildContext context) {
    final payment = item.paymentStatus == 'PAID' ? 'Оплачено' : 'Не оплачено';

    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(item.title, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: AppSpacing.xs),
            Text('${_formatDate(item.startsAt)} · ${item.athleteName}'),
            if (item.location != null) Text(item.location!),
            const SizedBox(height: AppSpacing.xs),
            Text('Заявка · $payment'),
            ...item.entries.map((entry) {
              final discipline = entry.discipline == 'KATA' ? 'Ката' : 'Кумитэ';
              final medal = switch (entry.medal) {
                'GOLD' => '🥇',
                'SILVER' => '🥈',
                'BRONZE' => '🥉',
                _ => '',
              };
              final result = item.resultsPublished
                  ? [
                      entry.place != null ? '${entry.place} место' : null,
                      medal.isEmpty ? null : medal,
                    ].whereType<String>().join(' ')
                  : null;

              return Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: Text(
                  '$discipline · ${entry.category}'
                  '${result == null || result.isEmpty ? '' : ' · $result'}',
                ),
              );
            }),
            if (!item.resultsPublished)
              const Padding(
                padding: EdgeInsets.only(top: AppSpacing.xs),
                child: Text('Результаты появятся после публикации'),
              ),
          ],
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.text, required this.icon});

  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
      child: Column(
        children: [
          Icon(icon, size: 40),
          const SizedBox(height: AppSpacing.sm),
          Text(text, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

String _formatDate(DateTime value) {
  const months = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ];

  return '${value.day} ${months[value.month - 1]} ${value.year}';
}
