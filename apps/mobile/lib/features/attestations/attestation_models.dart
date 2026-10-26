/// Аттестации для тренера и администратора (#40 продолжение).
///
/// Родителю этот экран не нужен: он видит опубликованные результаты ребёнка во
/// вкладке «Спорт». Здесь — рабочая часть: допуск и итог в зале.
library;

/// Мероприятие.
class AttestationEvent {
  const AttestationEvent({
    required this.id,
    required this.title,
    required this.scheduledAt,
    required this.location,
    required this.status,
    required this.participantsCount,
  });

  final String id;
  final String title;
  final DateTime scheduledAt;
  final String? location;
  final String status;
  final int participantsCount;

  bool get isEditable => status == 'IN_PROGRESS' || status == 'PLANNED';

  factory AttestationEvent.fromJson(Map<String, dynamic> json) {
    return AttestationEvent(
      id: json['id'] as String,
      title: (json['title'] as String?) ?? '',
      scheduledAt: DateTime.tryParse('${json['scheduledAt']}')?.toLocal() ?? DateTime.now(),
      location: json['location'] as String?,
      status: (json['status'] as String?) ?? 'DRAFT',
      participantsCount: json['participantsCount'] is int ? json['participantsCount'] as int : 0,
    );
  }
}

/// Участник мероприятия.
class AttestationParticipant {
  const AttestationParticipant({
    required this.id,
    required this.athleteId,
    required this.athleteName,
    required this.targetRankLabel,
    required this.admission,
    required this.paymentStatus,
    required this.result,
    required this.awardedRankLabel,
  });

  final String id;
  final String athleteId;
  final String athleteName;
  final String targetRankLabel;
  final String admission;
  final String paymentStatus;
  final String result;
  final String? awardedRankLabel;

  /// Итог уже записан: исправление требует причины, и UI должен это знать.
  bool get hasResult => result != 'PENDING';

  factory AttestationParticipant.fromJson(Map<String, dynamic> json) {
    final athlete = json['athlete'];

    return AttestationParticipant(
      id: json['id'] as String,
      athleteId: (json['athleteId'] as String?) ?? '',
      athleteName: athlete is Map<String, dynamic>
          ? '${athlete['lastName'] ?? ''} ${athlete['firstName'] ?? ''}'.trim()
          : '',
      targetRankLabel: (json['targetRankLabel'] as String?) ?? '',
      admission: (json['admission'] as String?) ?? 'PENDING',
      paymentStatus: (json['paymentStatus'] as String?) ?? 'UNPAID',
      result: (json['result'] as String?) ?? 'PENDING',
      awardedRankLabel: json['awardedRankLabel'] as String?,
    );
  }
}
