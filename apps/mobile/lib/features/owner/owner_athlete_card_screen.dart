import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/club_clock.dart';
import '../../design/tokens.dart';
import '../auth/auth_controller.dart';

/// Карточка спортсмена для владельца.
///
/// Данные — `/athletes/{id}`: группа, тренер, зал, пояс, статус, контакты,
/// история спортивных результатов. Финансовый блок показывается только при
/// праве `payments.view` — RBAC тот же, что в веб-админке.
class OwnerAthleteCardScreen extends StatefulWidget {
  const OwnerAthleteCardScreen({
    super.key,
    required this.auth,
    required this.client,
    required this.athleteId,
    this.preview,
  });

  final AuthController auth;
  final ApiClient client;
  final String athleteId;

  /// Данные из списка: показываются сразу, пока грузится полная карточка.
  final Map<String, dynamic>? preview;

  @override
  State<OwnerAthleteCardScreen> createState() => _OwnerAthleteCardScreenState();
}

class _OwnerAthleteCardScreenState extends State<OwnerAthleteCardScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _athlete;
  Map<String, dynamic>? _finance;
  bool _canViewFinance = false;

  @override
  void initState() {
    super.initState();
    _canViewFinance = widget.auth.user?.hasPermission('payments.view') ?? false;
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
      final athlete = await widget.client.getJson(
        '/athletes/${widget.athleteId}',
        token: token,
      );
      Map<String, dynamic>? finance;
      if (_canViewFinance) {
        try {
          finance = await widget.client.getJson(
            '/finance/athletes/${widget.athleteId}',
            token: token,
          );
        } catch (_) {
          // Нет доступа или нет данных — блок просто не показываем.
        }
      }
      if (!mounted) {
        return;
      }
      setState(() {
        _athlete = athlete;
        _finance = finance;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Не удалось загрузить карточку');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final athlete = _athlete ?? widget.preview ?? const <String, dynamic>{};
    final firstName = athlete['firstName'] as String? ?? '';
    final lastName = athlete['lastName'] as String? ?? '';
    final middleName = athlete['middleName'] as String?;
    final title = [lastName, firstName, middleName]
        .whereType<String>()
        .where((part) => part.isNotEmpty)
        .join(' ');

    return Scaffold(
      appBar: AppBar(title: const Text('Спортсмен')),
      body: _loading && _athlete == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              children: [
                if (_error != null) ...[
                  _ErrorBlock(message: _error!, onRetry: _load),
                  const SizedBox(height: 16),
                ],
                Row(
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: AppColors.accentSoft,
                      foregroundColor: AppColors.accentDark,
                      child: Text(
                        _initials(firstName, lastName),
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 18,
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title.isEmpty ? 'Без имени' : title,
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _subtitle(athlete),
                            style: const TextStyle(color: AppColors.textSecondary),
                          ),
                        ],
                      ),
                    ),
                    _StatusPill(status: athlete['status'] as String?),
                  ],
                ),
                const SizedBox(height: 20),
                _InfoCard(rows: [
                  ('Группа', _groupName(athlete)),
                  if ((athlete['trainer'] as Map?)?['name'] != null)
                    ('Тренер', (athlete['trainer'] as Map)['name'] as String),
                  if (_hallName(athlete) != null) ('Зал', _hallName(athlete)!),
                  if (athlete['rankLabel'] != null)
                    ('Пояс', athlete['rankLabel'] as String),
                  if (athlete['birthDate'] != null)
                    ('Дата рождения', ClubClock.formatShortDate(athlete['birthDate'] as String)),
                  if ((athlete['phone'] as String?)?.isNotEmpty ?? false)
                    ('Телефон', athlete['phone'] as String),
                  if ((athlete['email'] as String?)?.isNotEmpty ?? false)
                    ('Email', athlete['email'] as String),
                ]),
                if (_canViewFinance && _finance != null) ...[
                  const SizedBox(height: 20),
                  const _SectionTitle('Финансы'),
                  const SizedBox(height: 8),
                  _InfoCard(rows: [
                    ('Долг', _money(_finance!['debt'])),
                    ('Тариф', _tariff(_finance!)),
                  ]),
                ],
                const SizedBox(height: 20),
                const _SectionTitle('Посещаемость и результаты'),
                const SizedBox(height: 8),
                _SportsHistory(history: athlete['sportsHistory']),
              ],
            ),
    );
  }

  String _initials(String first, String last) {
    final a = first.isNotEmpty ? first[0] : '';
    final b = last.isNotEmpty ? last[0] : '';
    final value = '$a$b'.toUpperCase();
    return value.isEmpty ? '?' : value;
  }

  String _subtitle(Map<String, dynamic> athlete) {
    final parts = <String>[];
    final group = _groupName(athlete);
    if (group != '—') {
      parts.add(group);
    }
    final birth = athlete['birthDate'] as String?;
    if (birth != null && birth.length >= 4) {
      parts.add(birth.substring(0, 4));
    }
    return parts.join(' · ');
  }

  String _groupName(Map<String, dynamic> athlete) {
    final group = athlete['group'] as Map?;
    final name = group?['name'] as String? ?? athlete['groupName'] as String?;
    return name ?? '—';
  }

  String? _hallName(Map<String, dynamic> athlete) {
    final hall = athlete['hall'] as Map?;
    return hall?['name'] as String?;
  }

  String _tariff(Map<String, dynamic> finance) {
    final value = finance['monthlyFee'] ?? finance['expected'];
    if (value == null) {
      return 'не задан';
    }
    return _money(value);
  }

  String _money(dynamic value) {
    final amount = (value as num?)?.toInt();
    if (amount == null) {
      return '—';
    }
    final digits = amount.abs().toString();
    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) {
        buffer.write(' ');
      }
      buffer.write(digits[i]);
    }
    return '${amount < 0 ? '−' : ''}$buffer ₽';
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) =>
      Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600));
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.rows});

  final List<(String, String)> rows;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return const SizedBox.shrink();
    }
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
                  child: Text(rows[i].$2,
                      textAlign: TextAlign.right,
                      style: const TextStyle(fontWeight: FontWeight.w500)),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _SportsHistory extends StatelessWidget {
  const _SportsHistory({required this.history});

  final dynamic history;

  @override
  Widget build(BuildContext context) {
    final dynamic raw = history;
    final List<Map<String, dynamic>> items = raw is List
        ? raw.whereType<Map<String, dynamic>>().toList(growable: false)
        : <Map<String, dynamic>>[];
    if (items.isEmpty) {
      return Container(
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(AppRadius.card),
          border: Border.all(color: AppColors.divider),
        ),
        child: const Text(
          'Пока нет записей об аттестациях и соревнованиях',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
        ),
      );
    }
    return Column(
      children: [
        for (final item in items)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(AppRadius.card),
              border: Border.all(color: AppColors.divider),
            ),
            child: Text(
              item['title'] as String? ?? item['name'] as String? ?? 'Запись',
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
      ],
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});

  final String? status;

  @override
  Widget build(BuildContext context) {
    final (label, color, background) = switch (status) {
      'FROZEN' => ('заморожен', AppColors.warning, const Color(0xFFFFF3E0)),
      'ARCHIVED' => ('архив', AppColors.textSecondary, AppColors.surfaceMuted),
      _ => ('активен', AppColors.success, const Color(0xFFE8F5EE)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label,
          style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
    );
  }
}

class _ErrorBlock extends StatelessWidget {
  const _ErrorBlock({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: AppColors.danger),
          const SizedBox(width: 10),
          Expanded(child: Text(message)),
          TextButton(onPressed: onRetry, child: const Text('Повторить')),
        ],
      ),
    );
  }
}
