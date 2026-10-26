import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../design/tokens.dart';
import '../auth/auth_controller.dart';

/// Заявка на пробную тренировку (ADR-0013).
class TrialRequest {
  const TrialRequest({
    required this.id,
    required this.name,
    required this.phone,
    required this.childName,
    required this.childAge,
    required this.comment,
    required this.status,
    required this.createdAt,
  });

  final String id;
  final String name;
  final String phone;
  final String? childName;
  final int? childAge;
  final String? comment;
  final String status;
  final DateTime createdAt;

  bool get isFinal => status == 'CONVERTED' || status == 'REJECTED';

  factory TrialRequest.fromJson(Map<String, dynamic> json) {
    return TrialRequest(
      id: json['id'] as String,
      name: (json['name'] as String?) ?? '',
      phone: (json['phone'] as String?) ?? '',
      childName: json['childName'] as String?,
      childAge: json['childAge'] is int ? json['childAge'] as int : null,
      comment: json['comment'] as String?,
      status: (json['status'] as String?) ?? 'NEW',
      createdAt: DateTime.tryParse('${json['createdAt']}')?.toLocal() ?? DateTime.now(),
    );
  }
}

/// Репозиторий заявок.
class TrialRequestsRepository {
  const TrialRequestsRepository({required this.client});

  final ApiClient client;

  Future<List<TrialRequest>> list(String token) async {
    final response = await client.getJson('/trial-requests', token: token);
    final raw = response['data'] ?? response;

    if (raw is! List) {
      return const [];
    }

    return raw.whereType<Map<String, dynamic>>().map(TrialRequest.fromJson).toList();
  }

  Future<void> setStatus(String token, String id, String status) async {
    await client.patchJson('/trial-requests/$id', token: token, body: {'status': status});
  }
}

/// Состояние списка заявок.
class TrialRequestsController extends ChangeNotifier {
  TrialRequestsController({required this.repository});

  final TrialRequestsRepository repository;

  List<TrialRequest> _items = const [];
  String? _error;
  bool _loading = false;

  List<TrialRequest> get items => _items;
  String? get error => _error;
  bool get loading => _loading;

  Future<void> load(String token) async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      _items = await repository.list(token);
    } catch (error) {
      _error = 'Не удалось загрузить заявки';
      if (kDebugMode) {
        debugPrint('TrialRequestsController.load: $error');
      }
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<String?> setStatus(String token, TrialRequest request, String status) async {
    try {
      await repository.setStatus(token, request.id, status);
      await load(token);
      return null;
    } catch (error) {
      if (kDebugMode) {
        debugPrint('TrialRequestsController.setStatus: $error');
      }
      return 'Не удалось изменить статус';
    }
  }
}

/// Экран заявок: воронка от звонка до зачисления.
class TrialRequestsScreen extends StatefulWidget {
  const TrialRequestsScreen({super.key, required this.auth, required this.controller});

  final AuthController auth;
  final TrialRequestsController controller;

  @override
  State<TrialRequestsScreen> createState() => _TrialRequestsScreenState();
}

class _TrialRequestsScreenState extends State<TrialRequestsScreen> {
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChanged);
    _reload();
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

  Future<void> _reload() async {
    final token = widget.auth.session?.accessToken;
    if (token != null) {
      await widget.controller.load(token);
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Заявки'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), tooltip: 'Обновить', onPressed: _reload),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            if (controller.loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (controller.error != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
                child: Text(controller.error!, textAlign: TextAlign.center),
              )
            else if (controller.items.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
                child: Text('Заявок нет.', textAlign: TextAlign.center),
              )
            else
              ...controller.items.map(_buildRequest),
          ],
        ),
      ),
    );
  }

  Widget _buildRequest(TrialRequest request) {
    final token = widget.auth.session?.accessToken;

    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(request.name, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 2),
            Text(
              [
                request.phone,
                if (request.childName != null) 'ребёнок: ${request.childName}',
                if (request.childAge != null) '${request.childAge} лет',
              ].join(' · '),
              style: const TextStyle(color: AppColors.textSecondary),
            ),
            if (request.comment != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(request.comment!),
              ),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(_statusLabel(request.status)),
            ),
            if (!request.isFinal && token != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    OutlinedButton(
                      onPressed: () => _setStatus(token, request, nextStatus(request.status)),
                      child: Text(nextLabel(request.status)),
                    ),
                    OutlinedButton(
                      onPressed: () => _setStatus(token, request, 'REJECTED'),
                      child: const Text('Отказ'),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _setStatus(String token, TrialRequest request, String status) async {
    final error = await widget.controller.setStatus(token, request, status);
    if (mounted) {
      setState(() => _error = error);
    }
  }
}

String nextStatus(String status) {
  return switch (status) {
    'NEW' => 'CONTACTED',
    'CONTACTED' => 'TRIAL_SCHEDULED',
    'TRIAL_SCHEDULED' => 'CONVERTED',
    _ => status,
  };
}

String nextLabel(String status) {
  return switch (status) {
    'NEW' => 'Связались',
    'CONTACTED' => 'Записать на пробное',
    'TRIAL_SCHEDULED' => 'Стал спортсменом',
    _ => 'Дальше',
  };
}

String _statusLabel(String status) {
  return switch (status) {
    'NEW' => 'Новая',
    'CONTACTED' => 'Связались',
    'TRIAL_SCHEDULED' => 'Записан на пробное',
    'CONVERTED' => 'Стал спортсменом',
    'REJECTED' => 'Отказ',
    _ => status,
  };
}
