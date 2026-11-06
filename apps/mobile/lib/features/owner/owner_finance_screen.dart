import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../design/tokens.dart';
import '../auth/auth_controller.dart';

/// Финансы клуба: поступления, долг, должники и последние платежи.
///
/// Цифры совпадают с веб-админкой: оба клиента читают `/finance/summary`.
class OwnerFinanceScreen extends StatefulWidget {
  const OwnerFinanceScreen({super.key, required this.auth, required this.client});

  final AuthController auth;
  final ApiClient client;

  @override
  State<OwnerFinanceScreen> createState() => _OwnerFinanceScreenState();
}

class _OwnerFinanceScreenState extends State<OwnerFinanceScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _summary;
  List<Map<String, dynamic>> _payments = [];

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

    final now = DateTime.now();
    try {
      final results = await Future.wait([
        widget.client.getJson(
          '/finance/summary?year=${now.year}&month=${now.month}',
          token: token,
        ),
        widget.client.getJson('/payment-transactions?page=1&limit=10', token: token)
            .catchError((_) => <String, dynamic>{}),
      ]);
      if (!mounted) {
        return;
      }
      setState(() {
        _summary = results[0];
        _payments = ((results[1]['data'] ?? results[1]['items']) as List?)
                ?.whereType<Map<String, dynamic>>()
                .toList() ??
            const [];
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Не удалось загрузить финансы');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    const months = [
      'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
      'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
    ];

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          Text('Финансы', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text(
            '${months[now.month - 1]} ${now.year}',
            style: const TextStyle(color: AppColors.textSecondary),
          ),
          const SizedBox(height: 16),
          if (_loading) ...List.generate(
            3,
            (_) => Container(
              height: 84,
              margin: const EdgeInsets.only(bottom: 10),
              decoration: BoxDecoration(
                color: AppColors.surfaceMuted,
                borderRadius: BorderRadius.circular(AppRadius.card),
              ),
            ),
          ),
          if (_error != null) _ErrorBlock(message: _error!, onRetry: _load),
          if (!_loading && _error == null && _summary != null) ...[
            _BigMoneyCard(
              label: 'Поступления',
              value: _money((_summary!['totals'] as Map?)?['received'] as num?),
              hint: _payments.isEmpty ? 'платежей нет' : '${_payments.length} последних',
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _SmallCard(
                    label: 'Ожидалось',
                    value: _money(_summary!['expected'] as num?),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _SmallCard(
                    label: 'Долг',
                    value: _money(_summary!['debt'] as num?),
                    danger: ((_summary!['debt'] as num?)?.toInt() ?? 0) > 0,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            const Text('Последние платежи',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            if (_payments.isEmpty)
              const _EmptyBlock(title: 'Платежей нет', subtitle: 'За этот месяц поступлений не было')
            else
              ..._payments.take(6).map((payment) => _PaymentTile(payment: payment)),
          ],
        ],
      ),
    );
  }
}

class _BigMoneyCard extends StatelessWidget {
  const _BigMoneyCard({required this.label, required this.value, required this.hint});

  final String label;
  final String value;
  final String hint;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textSecondary)),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value,
                style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(height: 4),
          Text(hint, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}

class _SmallCard extends StatelessWidget {
  const _SmallCard({required this.label, required this.value, this.danger = false});

  final String label;
  final String value;
  final bool danger;

  @override
  Widget build(BuildContext context) {
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
          Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: danger ? AppColors.danger : AppColors.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PaymentTile extends StatelessWidget {
  const _PaymentTile({required this.payment});

  final Map<String, dynamic> payment;

  @override
  Widget build(BuildContext context) {
    final amount = (payment['amount'] as num?)?.toInt() ?? 0;
    final raw = payment['paidAt'] as String? ?? payment['createdAt'] as String?;
    final date = raw == null ? null : DateTime.tryParse(raw)?.toLocal();
    final athlete = payment['athlete'] as Map?;
    final name = athlete == null
        ? 'Платёж'
        : '${athlete['lastName'] ?? ''} ${athlete['firstName'] ?? ''}'.trim();

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
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
                if (date != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    '${date.day}.${date.month.toString().padLeft(2, '0')}.${date.year}',
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                  ),
                ],
              ],
            ),
          ),
          Text(
            _money(amount),
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              color: AppColors.success,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyBlock extends StatelessWidget {
  const _EmptyBlock({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(subtitle,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        ],
      ),
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
      margin: const EdgeInsets.only(top: 24),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        children: [
          const Icon(Icons.error_outline, color: AppColors.danger, size: 32),
          const SizedBox(height: 12),
          Text(message, style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 16),
          FilledButton(onPressed: onRetry, child: const Text('Повторить')),
        ],
      ),
    );
  }
}

String _money(num? value) {
  final amount = (value ?? 0).toInt();
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
