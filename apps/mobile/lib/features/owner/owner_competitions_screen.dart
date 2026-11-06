import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../design/tokens.dart';
import '../auth/auth_controller.dart';

/// Соревнования клуба: список и ближайшие даты.
///
/// Только просмотр: заявки на турниры, категории и результаты ведутся в
/// веб-админке. Экран отвечает на вопрос «что у нас в календаре».
class OwnerCompetitionsScreen extends StatefulWidget {
  const OwnerCompetitionsScreen({
    super.key,
    required this.auth,
    required this.client,
  });

  final AuthController auth;
  final ApiClient client;

  @override
  State<OwnerCompetitionsScreen> createState() => _OwnerCompetitionsScreenState();
}

class _OwnerCompetitionsScreenState extends State<OwnerCompetitionsScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = widget.auth.session?.accessToken;
    if (token == null) {
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await widget.client.getJson('/competitions', token: token);
      final raw = response['data'] ?? response['items'];
      if (!mounted) {
        return;
      }
      setState(() {
        _items = raw is List
            ? raw.whereType<Map<String, dynamic>>().toList()
            : const [];
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Не удалось загрузить соревнования');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, color: AppColors.danger, size: 40),
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 16),
            FilledButton(onPressed: _load, child: const Text('Повторить')),
          ],
        ),
      );
    }
    if (_items.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Соревнований нет',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
              SizedBox(height: 6),
              Text('Турниры и заявки создаются в веб-админке',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textSecondary)),
            ],
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _items.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) => _CompetitionCard(item: _items[index]),
      ),
    );
  }
}

class _CompetitionCard extends StatelessWidget {
  const _CompetitionCard({required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final title = item['title'] as String? ?? item['name'] as String? ?? 'Турнир';
    final raw = item['startsAt'] as String? ?? item['scheduledAt'] as String?;
    final date = raw == null ? null : DateTime.tryParse(raw)?.toLocal();
    final place = item['location'] as String?;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
          if (date != null) ...[
            const SizedBox(height: 4),
            Text(
              '${date.day}.${date.month.toString().padLeft(2, '0')}.${date.year}',
              style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
          ],
          if (place != null && place.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(place,
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          ],
        ],
      ),
    );
  }
}
