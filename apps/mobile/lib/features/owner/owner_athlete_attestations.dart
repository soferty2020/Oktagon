import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/club_clock.dart';
import '../../design/tokens.dart';

/// Аттестации спортсмена: присвоенные ступени и участие в мероприятиях.
///
/// Два разных факта, которые нельзя смешивать:
/// - **присвоение** (`/athletes/:id/certifications`) — ступень уже присуждена,
///   у записи есть дата и пояс;
/// - **участие** (`/certification-events/:id/participants`) — спортсмена
///   назначили на экзамен; результата может ещё не быть или он не опубликован.
///
/// Показывать участие как «сдал» — значит выдать ожидание за результат,
/// поэтому у каждого состояния своя подпись.
class AthleteAttestationsSection extends StatelessWidget {
  const AthleteAttestationsSection({
    super.key,
    required this.certifications,
    required this.participations,
    required this.loading,
    required this.error,
  });

  /// Присвоенные ступени, новые сверху.
  final List<AthleteCertification> certifications;

  /// Участие в мероприятиях, новые сверху.
  final List<AthleteParticipation> participations;
  final bool loading;
  final String? error;

  bool get isEmpty => certifications.isEmpty && participations.isEmpty;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (error != null)
          _Notice(text: error!, tone: AppColors.danger)
        else if (isEmpty)
  const _Notice(
            text: 'Аттестаций пока нет: спортсмена не назначали на экзамен и '
                'ступень ещё не присваивалась.',
            tone: AppColors.textSecondary,
          )
        else ...[
          if (certifications.isNotEmpty) ...[
            const _SubTitle('Присвоенные ступени'),
            for (final item in certifications) _CertificationCard(item: item),
          ],
          if (participations.isNotEmpty) ...[
            const SizedBox(height: 8),
            const _SubTitle('Участие в аттестациях'),
            for (final item in participations) _ParticipationCard(item: item),
          ],
        ],
      ],
    );
  }
}

/// Присвоенная ступень.
class AthleteCertification {
  const AthleteCertification({
    required this.id,
    required this.certifiedOn,
    required this.stageLabel,
    required this.beltGrade,
    this.note,
  });

  final String id;
  final String certifiedOn;
  final String stageLabel;
  final String? beltGrade;
  final String? note;

  factory AthleteCertification.fromJson(Map<String, dynamic> json) {
    return AthleteCertification(
      id: (json['id'] as String?) ?? '',
      certifiedOn: (json['certifiedOn'] as String?) ?? '',
      stageLabel: (json['stageLabel'] as String?) ??
          (json['rankLabel'] as String?) ??
          'ступень не указана',
      beltGrade: json['beltGrade'] as String?,
      note: json['note'] as String?,
    );
  }
}

/// Участие в мероприятии.
class AthleteParticipation {
  const AthleteParticipation({
    required this.eventId,
    required this.eventTitle,
    required this.scheduledAt,
    required this.targetRankLabel,
    required this.result,
    required this.resultsPublished,
    this.awardedRankLabel,
  });

  final String eventId;
  final String eventTitle;
  final String? scheduledAt;
  final String targetRankLabel;
  final String result;
  final bool resultsPublished;
  final String? awardedRankLabel;

  /// Опубликован ли итог. Неопубликованный результат — не «сдал».
  bool get hasPublishedResult => resultsPublished && result != 'PENDING';

  factory AthleteParticipation.fromJson(
    Map<String, dynamic> json,
    Map<String, dynamic> event,
  ) {
    return AthleteParticipation(
      eventId: (json['eventId'] as String?) ?? '',
      eventTitle: (event['title'] as String?) ?? 'Аттестация',
      scheduledAt: event['scheduledAt'] as String?,
      targetRankLabel: (json['targetRankLabel'] as String?) ?? '—',
      result: (json['result'] as String?) ?? 'PENDING',
      resultsPublished: json['resultsPublished'] == true,
      awardedRankLabel: json['awardedRankLabel'] as String?,
    );
  }
}

class _CertificationCard extends StatelessWidget {
  const _CertificationCard({required this.item});

  final AthleteCertification item;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          const Icon(Icons.workspace_premium, color: AppColors.accent, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.stageLabel,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(
                  [
                    if (item.certifiedOn.isNotEmpty) _date(item.certifiedOn),
                    if (item.beltGrade != null) _belt(item.beltGrade!),
                  ].join(' · '),
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          const _Pill(text: 'присвоено', color: AppColors.success),
        ],
      ),
    );
  }

  static String _date(String iso) {
    final parsed = DateTime.tryParse(iso);
    if (parsed == null) {
      return iso;
    }
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];
    return '${parsed.day} ${months[parsed.month - 1]} ${parsed.year}';
  }

  static String _belt(String grade) {
    const labels = {
      'WHITE': 'белый пояс',
      'ORANGE': 'оранжевый пояс',
      'BLUE': 'синий пояс',
      'YELLOW': 'жёлтый пояс',
      'GREEN': 'зелёный пояс',
      'BROWN': 'коричневый пояс',
      'BLACK': 'чёрный пояс',
    };
    return labels[grade] ?? grade;
  }
}

class _ParticipationCard extends StatelessWidget {
  const _ParticipationCard({required this.item});

  final AthleteParticipation item;

  @override
  Widget build(BuildContext context) {
    final (label, color, background) = switch (item) {
      _ when !item.hasPublishedResult => (
          'ожидает результата',
          AppColors.textSecondary,
          AppColors.surfaceMuted,
        ),
      _ when item.result == 'PASSED' => (
          'сдал${item.awardedRankLabel != null ? ' · ${item.awardedRankLabel}' : ''}',
          AppColors.success,
          const Color(0xFFE8F5EE),
        ),
      _ when item.result == 'FAILED' => (
          'не сдал',
          AppColors.danger,
          const Color(0xFFFDECEC),
        ),
      _ => ('не явился', AppColors.warning, const Color(0xFFFFF3E0)),
    };

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(item.eventTitle,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              _Pill(text: label, color: color, background: background),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            [
              if (item.scheduledAt != null) ClubClock.formatDate(item.scheduledAt),
              'цель: ${item.targetRankLabel}',
            ].join(' · '),
            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          if (!item.hasPublishedResult) ...[
            const SizedBox(height: 4),
            const Text(
              'Результат не опубликован — ступень не присвоена',
              style: TextStyle(fontSize: 11, color: AppColors.textTertiary),
            ),
          ],
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text, required this.color, this.background});

  final String text;
  final Color color;
  final Color? background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: background ?? AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(text,
          style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
    );
  }
}

class _SubTitle extends StatelessWidget {
  const _SubTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 6),
        child: Text(text,
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.textSecondary)),
      );
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text, required this.tone});

  final String text;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Text(text, style: TextStyle(fontSize: 12, color: tone)),
    );
  }
}

/// Загружает аттестации спортсмена: присвоения и участие.
Future<({List<AthleteCertification> certifications, List<AthleteParticipation> participations})>
    loadAthleteAttestations({
  required ApiClient client,
  required String token,
  required String athleteId,
}) async {
  final certificationsRaw = await client.getJson(
    '/athletes/$athleteId/certifications',
    token: token,
  );
  final certifications = _asList(certificationsRaw)
      .map(AthleteCertification.fromJson)
      .toList();

  // Мероприятий немного (единицы), поэтому участие собирается по ним.
  // Отдельного маршрута «мероприятия спортсмена» в API нет.
  final eventsRaw = await client.getJson('/certification-events', token: token);
  final events = _asList(eventsRaw);
  final participations = <AthleteParticipation>[];
  for (final event in events) {
    final eventId = event['id'] as String?;
    if (eventId == null) {
      continue;
    }
    try {
      final participantsRaw = await client.getJson(
        '/certification-events/$eventId/participants',
        token: token,
      );
      for (final participant in _asList(participantsRaw)) {
        final athlete = participant['athlete'] as Map<String, dynamic>?;
        if (athlete?['id'] == athleteId) {
          participations.add(AthleteParticipation.fromJson(participant, event));
        }
      }
    } catch (_) {
      // Нет доступа к мероприятию — пропускаем, историю не ломаем.
    }
  }

  participations.sort((a, b) => (b.scheduledAt ?? '').compareTo(a.scheduledAt ?? ''));
  return (certifications: certifications, participations: participations);
}

List<Map<String, dynamic>> _asList(Map<String, dynamic> response) {
  // Клиент оборачивает массив в `data`, поэтому верхний уровень всегда Map.
  final raw = response['data'] ?? response['items'];
  if (raw is List) {
    return raw.whereType<Map<String, dynamic>>().toList();
  }
  return const [];
}
