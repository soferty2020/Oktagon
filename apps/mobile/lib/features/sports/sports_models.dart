/// Мероприятия ребёнка глазами родителя (#41).
///
/// Модель повторяет ответ `GET /me/sports`: сервер уже отфильтровал чужих
/// спортсменов и скрыл неопубликованные результаты, поэтому клиенту не нужно
/// ничего досчитывать — он только показывает.
library;

/// Аттестация.
class MeAttestation {
  const MeAttestation({
    required this.id,
    required this.title,
    required this.scheduledAt,
    required this.location,
    required this.status,
    required this.athleteId,
    required this.athleteName,
    required this.admission,
    required this.paymentStatus,
    required this.resultsPublished,
    required this.result,
    required this.resultLabel,
  });

  final String id;
  final String title;
  final DateTime scheduledAt;
  final String? location;
  final String status;
  final String athleteId;
  final String athleteName;
  final String admission;
  final String paymentStatus;
  final bool resultsPublished;
  final String result;
  final String? resultLabel;

  factory MeAttestation.fromJson(Map<String, dynamic> json) {
    return MeAttestation(
      id: json['id'] as String,
      title: (json['title'] as String?) ?? '',
      scheduledAt: DateTime.tryParse('${json['scheduledAt']}')?.toLocal() ?? DateTime.now(),
      location: json['location'] as String?,
      status: (json['status'] as String?) ?? 'DRAFT',
      athleteId: (json['athleteId'] as String?) ?? '',
      athleteName: (json['athleteName'] as String?) ?? '',
      admission: (json['admission'] as String?) ?? 'PENDING',
      paymentStatus: (json['paymentStatus'] as String?) ?? 'UNPAID',
      resultsPublished: json['resultsPublished'] == true,
      result: (json['result'] as String?) ?? 'PENDING',
      resultLabel: json['resultLabel'] as String?,
    );
  }
}

/// Участие ребёнка в турнире: дисциплина, категория и результат.
class MeCompetitionEntry {
  const MeCompetitionEntry({
    required this.discipline,
    required this.category,
    required this.result,
    required this.place,
    required this.medal,
  });

  final String discipline;
  final String category;
  final String result;
  final int? place;
  final String medal;

  factory MeCompetitionEntry.fromJson(Map<String, dynamic> json) {
    return MeCompetitionEntry(
      discipline: (json['discipline'] as String?) ?? 'KUMITE',
      category: (json['category'] as String?) ?? '',
      result: (json['result'] as String?) ?? 'PENDING',
      place: json['place'] is int ? json['place'] as int : null,
      medal: (json['medal'] as String?) ?? 'NONE',
    );
  }
}

/// Соревнование.
class MeCompetition {
  const MeCompetition({
    required this.id,
    required this.title,
    required this.startsAt,
    required this.location,
    required this.level,
    required this.status,
    required this.athleteId,
    required this.athleteName,
    required this.paymentStatus,
    required this.resultsPublished,
    required this.entries,
  });

  final String id;
  final String title;
  final DateTime startsAt;
  final String? location;
  final String level;
  final String status;
  final String athleteId;
  final String athleteName;
  final String paymentStatus;
  final bool resultsPublished;
  final List<MeCompetitionEntry> entries;

  factory MeCompetition.fromJson(Map<String, dynamic> json) {
    final entries = json['entries'];

    return MeCompetition(
      id: json['id'] as String,
      title: (json['title'] as String?) ?? '',
      startsAt: DateTime.tryParse('${json['startsAt']}')?.toLocal() ?? DateTime.now(),
      location: json['location'] as String?,
      level: (json['level'] as String?) ?? 'CLUB',
      status: (json['status'] as String?) ?? 'DRAFT',
      athleteId: (json['athleteId'] as String?) ?? '',
      athleteName: (json['athleteName'] as String?) ?? '',
      paymentStatus: (json['paymentStatus'] as String?) ?? 'UNPAID',
      resultsPublished: json['resultsPublished'] == true,
      entries: entries is List
          ? entries
              .whereType<Map<String, dynamic>>()
              .map(MeCompetitionEntry.fromJson)
              .toList(growable: false)
          : const [],
    );
  }
}

/// Ответ `GET /me/sports`.
class MeSportsOverview {
  const MeSportsOverview({required this.attestations, required this.competitions});

  final List<MeAttestation> attestations;
  final List<MeCompetition> competitions;

  bool get isEmpty => attestations.isEmpty && competitions.isEmpty;

  factory MeSportsOverview.fromJson(Map<String, dynamic> json) {
    final attestations = json['attestations'];
    final competitions = json['competitions'];

    return MeSportsOverview(
      attestations: attestations is List
          ? attestations
              .whereType<Map<String, dynamic>>()
              .map(MeAttestation.fromJson)
              .toList(growable: false)
          : const [],
      competitions: competitions is List
          ? competitions
              .whereType<Map<String, dynamic>>()
              .map(MeCompetition.fromJson)
              .toList(growable: false)
          : const [],
    );
  }
}
