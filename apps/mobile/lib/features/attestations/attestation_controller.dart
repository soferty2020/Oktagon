import 'package:flutter/foundation.dart';

import 'attestation_models.dart';
import 'attestation_repository.dart';

/// Состояние экрана аттестаций (тренер и администратор).
class AttestationController extends ChangeNotifier {
  AttestationController({required this.repository});

  final AttestationRepository repository;

  List<AttestationEvent> _events = const [];
  List<AttestationParticipant> _participants = const [];
  String? _error;
  bool _loading = false;

  List<AttestationEvent> get events => _events;
  List<AttestationParticipant> get participants => _participants;
  String? get error => _error;
  bool get loading => _loading;

  Future<void> loadEvents(String token) async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      _events = await repository.listEvents(token);
    } catch (error) {
      _error = 'Не удалось загрузить аттестации';
      if (kDebugMode) {
        debugPrint('AttestationController.loadEvents: $error');
      }
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> loadParticipants(String token, String eventId) async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      _participants = await repository.listParticipants(token, eventId);
    } catch (error) {
      _error = 'Не удалось загрузить участников';
      if (kDebugMode) {
        debugPrint('AttestationController.loadParticipants: $error');
      }
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Допуск: ошибка возвращается вызывающему, чтобы экран показал её рядом.
  Future<String?> setAdmission(
    String token,
    String eventId,
    String athleteId,
    String admission,
  ) async {
    try {
      await repository.setAdmission(token, eventId, athleteId, admission);
      await loadParticipants(token, eventId);
      return null;
    } catch (error) {
      if (kDebugMode) {
        debugPrint('AttestationController.setAdmission: $error');
      }
      return 'Не удалось изменить допуск';
    }
  }

  Future<String?> recordResult(
    String token,
    String eventId,
    String athleteId, {
    required String result,
    String? awardedRank,
    String? comment,
    String? reason,
  }) async {
    try {
      await repository.recordResult(
        token,
        eventId,
        athleteId,
        result: result,
        awardedRank: awardedRank,
        comment: comment,
        reason: reason,
      );
      await loadParticipants(token, eventId);
      return null;
    } catch (error) {
      if (kDebugMode) {
        debugPrint('AttestationController.recordResult: $error');
      }
      return 'Не удалось сохранить итог';
    }
  }
}
