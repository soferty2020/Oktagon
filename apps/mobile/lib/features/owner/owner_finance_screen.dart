import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/club_clock.dart';
import '../../design/tokens.dart';
import '../auth/auth_controller.dart';
import 'owner_finance_dynamics_screen.dart';

/// Финансы клуба: поступления, ожидаемые начисления, долг и динамика.
///
/// Показатели нажимаемые: «Поступления», «Ожидалось» и «Долг» открывают
/// динамику по месяцам — списка отдельных платежей API не отдаёт, поэтому
/// экран показывает то, что действительно есть.
///
/// Отсутствие тарифа — отдельное состояние, а не «нулевой долг»: у части
/// спортсменов сумма не задана, и долг по ним не считается.
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
    final now = ClubClock.todayInClub();
    try {
      final summary = await widget.client.getJson(
        '/finance/summary?year=${now.year}&month=${now.month}',
        token: token,
      );
      if (!mounted) {
        return;
      }
      setState(() => _summary = summary);
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

  void _openDynamics(FinanceFocus focus) {
    final now = ClubClock.todayInClub();
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => OwnerFinanceDynamicsScreen(
          auth: widget.auth,
          client: widget.client,
          year: now.year,
          month: now.month,
          focus: focus,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final now = ClubClock.todayInClub();
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
          Text('${months[now.month - 1]} ${now.year}',
              style: const TextStyle(color: AppColors.textSecondary)),
          const SizedBox(height: 16),
          if (_loading)
            ...List.generate(
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
            _BigMoney(
              label: 'Поступления',
              value: _money(_summary!['totals']?['received']),
              hint: 'нажмите, чтобы увидеть по месяцам',
              onTap: () => _openDynamics(FinanceFocus.received),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _SmallMoney(
                    label: 'Ожидалось',
                    value: _money(_summary!['expected']),
                    onTap: () => _openDynamics(FinanceFocus.expected),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _SmallMoney(
                    label: 'Долг',
                    value: _money(_summary!['debt']),
                    danger: ((_summary!['debt'] as num?)?.toInt() ?? 0) > 0,
                    onTap: () => _openDynamics(FinanceFocus.debt),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _TariffNotice(
              withoutExpected:
                  (_summary!['debtorsWithoutExpected'] as num?)?.toInt() ?? 0,
              activeAthletes: (_summary!['activeAthletes'] as num?)?.toInt() ?? 0,
            ),
          ],
        ],
      ),
    );
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

/// Отсутствие тарифа — не «нулевой долг», а отдельное состояние.
class _TariffNotice extends StatelessWidget {
  const _TariffNotice({required this.withoutExpected, required this.activeAthletes});

  final int withoutExpected;
  final int activeAthletes;

  @override
  Widget build(BuildContext context) {
    if (withoutExpected == 0) {
      return const SizedBox.shrink();
    }
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.accentSoft,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline, size: 18, color: AppColors.accentDark),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$withoutExpected из $activeAthletes без установленной суммы',
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                ),
                const SizedBox(height: 4),
                const Text(
                  'По ним долг не рассчитывается — это не нулевая задолженность. '
                  'Сумма задаётся в веб-админке.',
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BigMoney extends StatelessWidget {
  const _BigMoney({
    required this.label,
    required this.value,
    required this.hint,
    required this.onTap,
  });

  final String label;
  final String value;
  final String hint;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(AppRadius.card),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.card),
            border: Border.all(color: AppColors.divider),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(label,
                        style: const TextStyle(color: AppColors.textSecondary)),
                  ),
                  const Icon(Icons.chevron_right,
                      size: 18, color: AppColors.textTertiary),
                ],
              ),
              const SizedBox(height: 4),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(value,
                    style:
                        const TextStyle(fontSize: 32, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(height: 4),
              Text(hint,
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.textSecondary)),
            ],
          ),
        ),
      ),
    );
  }
}

class _SmallMoney extends StatelessWidget {
  const _SmallMoney({
    required this.label,
    required this.value,
    required this.onTap,
    this.danger = false,
  });

  final String label;
  final String value;
  final VoidCallback onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(AppRadius.card),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.card),
            border: Border.all(color: AppColors.divider),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(label,
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.textSecondary)),
                  ),
                  const Icon(Icons.chevron_right,
                      size: 16, color: AppColors.textTertiary),
                ],
              ),
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
        ),
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
