import 'package:flutter/material.dart';

import '../../core/club_clock.dart';
import '../../design/tokens.dart';

/// Сведения о занятии.
///
/// Показывает то, что есть в `/training-sessions`: группа, зал, тренер, время
/// по часам клуба, статус. Действий редактирования здесь нет намеренно —
/// расписание ведётся в веб-админке, а мобильный экран только показывает
/// данные и предупреждает о переносах и отменах.
class OwnerSessionDetailsScreen extends StatelessWidget {
  const OwnerSessionDetailsScreen({super.key, required this.session});

  final Map<String, dynamic> session;

  @override
  Widget build(BuildContext context) {
    final startsAt = session['startsAt'] as String?;
    final endsAt = session['endsAt'] as String?;
    final groupName = session['groupName'] as String? ?? 'Группа не указана';
    final hallName = session['hallName'] as String?;
    final trainerName = session['trainerName'] as String?;
    final status = session['status'] as String?;
    final changeReason = session['changeReason'] as String?;

    return Scaffold(
      appBar: AppBar(title: const Text('Занятие')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          Text(groupName, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text(
            '${ClubClock.formatDate(startsAt)}, ${ClubClock.formatTime(startsAt)}'
            '${endsAt != null ? ' — ${ClubClock.formatTime(endsAt)}' : ''}',
            style: const TextStyle(color: AppColors.textSecondary),
          ),
          const SizedBox(height: 16),
          _InfoCard(
            rows: [
              ('Дата', ClubClock.formatShortDate(startsAt)),
              ('Время', '${ClubClock.formatTime(startsAt)} — ${ClubClock.formatTime(endsAt)}'),
              if (hallName != null && hallName.isNotEmpty) ('Зал', hallName),
              if (trainerName != null && trainerName.isNotEmpty) ('Тренер', trainerName),
              ('Статус', _statusLabel(status)),
            ],
          ),
          if (changeReason != null && changeReason.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.accentSoft,
                borderRadius: BorderRadius.circular(AppRadius.card),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, color: AppColors.accentDark, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(changeReason, style: const TextStyle(fontSize: 13)),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 20),
          Text(
            'Посещаемость отмечает тренер, изменения расписания — в веб-админке.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary,
                ),
          ),
        ],
      ),
    );
  }

  String _statusLabel(String? status) => switch (status) {
        'CANCELLED' => 'Отменено',
        'MOVED' => 'Перенесено',
        'COMPLETED' => 'Проведено',
        _ => 'По расписанию',
      };
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.rows});

  final List<(String, String)> rows;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) const Divider(height: 20),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(rows[i].$1,
                      style: const TextStyle(color: AppColors.textSecondary)),
                ),
                const SizedBox(width: 12),
                Flexible(
                  child: Text(
                    rows[i].$2,
                    textAlign: TextAlign.right,
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
