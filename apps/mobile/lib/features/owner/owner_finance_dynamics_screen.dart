import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../design/tokens.dart';
import '../auth/auth_controller.dart';

/// Динамика финансов по месяцам.
///
/// Списка отдельных платежей API не отдаёт (`/payment-transactions` — 404),
/// но `/finance/dynamics` возвращает точки по месяцам: поступления, долг и
/// число должников. На этот экран ведут показатели «Поступления»,
/// «Ожидалось» и «Долг».
class OwnerFinanceDynamicsScreen extends StatefulWidget {
  const OwnerFinanceDynamicsScreen({
    super.key,
    required this.auth,
    required this.client,
    required this.year,
    required this.month,
    this.focus = FinanceFocus.received,
    this.expectedTotal,
  });

  final AuthController auth;
  final ApiClient client;
  final int year;
  final int month;
  final FinanceFocus focus;

  /// Ожидаемая сумма месяца из /finance/summary — показывается только в
  /// режиме «Ожидаемые начисления», без разбивки по месяцам (её API не отдаёт).
  final int? expectedTotal;

  @override
  State<OwnerFinanceDynamicsScreen> createState() =>
      _OwnerFinanceDynamicsScreenState();
}

enum FinanceFocus { received, expected, debt }

class _OwnerFinanceDynamicsScreenState extends State<OwnerFinanceDynamicsScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _points = [];

  static const _months = [
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
  ];

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
      final response = await widget.client.getJson(
        '/finance/dynamics?year=${widget.year}&month=${widget.month}',
        token: token,
      );
      final points = ((response['points'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList();
      if (!mounted) {
        return;
      }
      setState(() => _points = points);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Не удалось загрузить динамику');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_title)),
      body: _buildBody(),
    );
  }

  String get _title => switch (widget.focus) {
        FinanceFocus.received => 'Поступления',
        FinanceFocus.expected => 'Ожидаемые начисления',
        FinanceFocus.debt => 'Задолженность',
      };

  Widget _buildBody() {
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
    if (_points.isEmpty) {
      return const Center(
        child: Text('Данных за период нет',
            style: TextStyle(color: AppColors.textSecondary)),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        if (widget.focus == FinanceFocus.expected)
          _ExpectedNotice(expected: widget.expectedTotal)
        else
          for (final point in _points)
            _MonthRow(
            label: '${_months[((point['month'] as num?)?.toInt() ?? 1) - 1]} '
                '${point['year']}',
            value: _value(point),
            secondary: _secondary(point),
            highlight: (point['month'] as num?)?.toInt() == widget.month &&
                (point['year'] as num?)?.toInt() == widget.year,
          ),
        const SizedBox(height: 16),
        Text(
          'Списка отдельных платежей API не отдаёт: суммы складываются из '
          'начислений и оплат, которые ведутся в веб-админке.',
          style: Theme.of(context)
              .textTheme
              .bodySmall
              ?.copyWith(color: AppColors.textSecondary),
        ),
      ],
    );
  }

  String _value(Map<String, dynamic> point) => switch (widget.focus) {
        FinanceFocus.received => _money(point['received']),
        // API не отдаёт ожидаемые начисления по месяцам: показываем только
        // фактические поступления и говорим об этом прямо.
        FinanceFocus.expected => _money(point['received']),
        FinanceFocus.debt => _money(point['debt']),
      };

  String _secondary(Map<String, dynamic> point) {
    final debtors = (point['debtors'] as num?)?.toInt() ?? 0;
    final withoutExpected =
        (point['debtorsWithoutExpected'] as num?)?.toInt() ?? 0;
    if (withoutExpected > 0) {
      return '$debtors должников · $withoutExpected без тарифа';
    }
    if (debtors > 0) {
      return '$debtors должников';
    }
    return 'долгов нет';
  }

  String _money(dynamic value) {
    final amount = (value as num?)?.toInt() ?? 0;
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

class _MonthRow extends StatelessWidget {
  const _MonthRow({
    required this.label,
    required this.value,
    required this.secondary,
    required this.highlight,
  });

  final String label;
  final String value;
  final String secondary;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: highlight ? AppColors.accentSoft : Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(
          color: highlight ? AppColors.accent : AppColors.divider,
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(secondary,
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.textSecondary)),
              ],
            ),
          ),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
/// Ожидаемые начисления: API отдаёт только общую сумму месяца.
///
/// Показывать вместо неё поступления нельзя — это разные деньги. Поэтому
/// экран честно объясняет ограничение и не рисует список месяцев.
class _ExpectedNotice extends StatelessWidget {
  const _ExpectedNotice({required this.expected});

  final int? expected;

  @override
  Widget build(BuildContext context) {
    final hasValue = (expected ?? 0) > 0;
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
          const Text('Ожидаемые начисления',
              style: TextStyle(color: AppColors.textSecondary)),
          const SizedBox(height: 4),
          if (hasValue)
            Text(_money(expected!),
                style:
                    const TextStyle(fontSize: 28, fontWeight: FontWeight.w700))
          else
            const Text('Сумма на текущий месяц не задана',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          const Text(
            'API отдаёт ожидаемую сумму только целиком за месяц — разбивки по '
            'спортсменам и дням нет. Здесь не показываются поступления: это '
            'другие деньги, и подменять ими ожидания нельзя.',
            style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }

  String _money(int value) {
    final digits = value.abs().toString();
    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) {
        buffer.write(' ');
      }
      buffer.write(digits[i]);
    }
    return '${value < 0 ? '−' : ''}$buffer ₽';
  }
}