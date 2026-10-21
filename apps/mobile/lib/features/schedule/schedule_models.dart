/// Занятие из расписания (`GET /training-sessions`).
///
/// Модель намеренно уже контракта: приложению нужны группа, место, тренер и
/// время. Причина переноса и признак «из шаблона» пригодятся в H4, но не на
/// главной.
class TrainingSession {
  const TrainingSession({
    required this.id,
    required this.groupId,
    required this.groupName,
    required this.hallName,
    required this.trainerName,
    required this.startsAt,
    required this.endsAt,
    required this.status,
  });

  final String id;
  final String groupId;
  final String groupName;
  final String? hallName;
  final String? trainerName;

  /// Время в UTC; для показа переводится в местное.
  final DateTime startsAt;
  final DateTime endsAt;

  /// `SCHEDULED`, `MOVED`, `CANCELLED`.
  final String status;

  bool get isCancelled => status == 'CANCELLED';

  factory TrainingSession.fromJson(Map<String, dynamic> json) {
    return TrainingSession(
      id: json['id'] as String,
      groupId: json['groupId'] as String,
      groupName: (json['groupName'] as String?) ?? '',
      hallName: json['hallName'] as String?,
      trainerName: json['trainerName'] as String?,
      startsAt: DateTime.parse(json['startsAt'] as String).toLocal(),
      endsAt: DateTime.parse(json['endsAt'] as String).toLocal(),
      status: (json['status'] as String?) ?? 'SCHEDULED',
    );
  }
}
