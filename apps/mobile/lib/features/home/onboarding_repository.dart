import '../../core/api_client.dart';

/// Статус заявки на привязку (ADR-0015).
class LinkRequestStatus {
  static const pending = 'PENDING';
  static const approved = 'APPROVED';
  static const rejected = 'REJECTED';
}

/// Заявка родителя на привязку к ребёнку.
class LinkRequest {
  const LinkRequest({
    required this.id,
    required this.status,
    required this.firstName,
    required this.lastName,
    this.birthDate,
    this.rejectReason,
  });

  final String id;
  final String status;
  final String firstName;
  final String lastName;
  final String? birthDate;
  final String? rejectReason;

  bool get isPending => status == LinkRequestStatus.pending;
  bool get isRejected => status == LinkRequestStatus.rejected;

  factory LinkRequest.fromJson(Map<String, dynamic> json) {
    return LinkRequest(
      id: json['id'] as String,
      status: json['status'] as String,
      firstName: json['firstName'] as String,
      lastName: json['lastName'] as String,
      birthDate: json['birthDate'] as String?,
      rejectReason: json['rejectReason'] as String?,
    );
  }
}

/// Привязка родителя к ребёнку: код и заявка (ADR-0015).
///
/// Отдельный репозиторий, а не часть домашнего: привязка — это онбординг, у неё
/// свой жизненный цикл и свои экраны.
class OnboardingRepository {
  OnboardingRepository({required ApiClient client}) : _client = client;

  final ApiClient _client;

  /// Принимает код от тренера или администратора.
  Future<void> acceptLinkCode(String code, {required String token}) async {
    await _client.postJson(
      '/me/link-code',
      token: token,
      body: {'code': code.trim().toUpperCase()},
    );
  }

  /// Создаёт заявку, если кода нет.
  Future<LinkRequest> createRequest({
    required String firstName,
    required String lastName,
    String? birthDate,
    String? phone,
    required String token,
  }) async {
    final response = await _client.postJson(
      '/me/link-requests',
      token: token,
      body: {
        'firstName': firstName.trim(),
        'lastName': lastName.trim(),
        if (birthDate != null && birthDate.isNotEmpty) 'birthDate': birthDate,
        if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
      },
    );

    return LinkRequest.fromJson(response);
  }

  /// Свои заявки: статус и причина отказа.
  Future<List<LinkRequest>> myRequests({required String token}) async {
    final response = await _client.getJson('/me/link-requests', token: token);

    // Список приходит массивом; `HttpApiClient` оборачивает его в `data`.
    final raw = response['data'] ?? response;
    if (raw is! List) {
      return const [];
    }

    return raw
        .whereType<Map<String, dynamic>>()
        .map(LinkRequest.fromJson)
        .toList(growable: false);
  }
}
