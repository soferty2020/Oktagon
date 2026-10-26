import '../../core/api_client.dart';
import 'attestation_models.dart';

/// Доступ к аттестациям для тренера и администратора.
///
/// Тот же API, что у админки: отдельного «мобильного» контракта нет, и это
/// правильно — правила допуска и результата должны быть одни.
abstract class AttestationRepository {
  Future<List<AttestationEvent>> listEvents(String token);

  Future<List<AttestationParticipant>> listParticipants(String token, String eventId);

  Future<void> setAdmission(String token, String eventId, String athleteId, String admission);

  Future<void> recordResult(
    String token,
    String eventId,
    String athleteId, {
    required String result,
    String? awardedRank,
    String? comment,
    String? reason,
  });
}

class ApiAttestationRepository implements AttestationRepository {
  const ApiAttestationRepository({required this.client});

  final ApiClient client;

  @override
  Future<List<AttestationEvent>> listEvents(String token) async {
    final response = await client.getJson('/certification-events', token: token);
    final raw = response['data'] ?? response;

    if (raw is! List) {
      return const [];
    }

    return raw.whereType<Map<String, dynamic>>().map(AttestationEvent.fromJson).toList();
  }

  @override
  Future<List<AttestationParticipant>> listParticipants(String token, String eventId) async {
    final response = await client.getJson(
      '/certification-events/$eventId/participants',
      token: token,
    );
    final raw = response['data'] ?? response;

    if (raw is! List) {
      return const [];
    }

    return raw
        .whereType<Map<String, dynamic>>()
        .map(AttestationParticipant.fromJson)
        .toList();
  }

  @override
  Future<void> setAdmission(
    String token,
    String eventId,
    String athleteId,
    String admission,
  ) async {
    await client.patchJson(
      '/certification-events/$eventId/participants/$athleteId',
      token: token,
      body: {'admission': admission},
    );
  }

  @override
  Future<void> recordResult(
    String token,
    String eventId,
    String athleteId, {
    required String result,
    String? awardedRank,
    String? comment,
    String? reason,
  }) async {
    await client.postJson(
      '/certification-events/$eventId/participants/$athleteId/result',
      token: token,
      body: {
        'result': result,
        if (awardedRank != null) 'awardedRank': awardedRank,
        if (comment != null && comment.isNotEmpty) 'comment': comment,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      },
    );
  }
}
