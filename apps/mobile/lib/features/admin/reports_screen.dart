import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../design/tokens.dart';
import '../auth/auth_controller.dart';

/// Сводка за месяц для руководителя: деньги и спортивные итоги.
///
/// Данные уже отдают `/finance/summary` и `/finance/dynamics` — отдельных
/// «мобильных» эндпоинтов нет, и это правильно: цифры должны совпадать с
/// веб-админкой.
class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key, required this.auth, required this.client});

  final AuthController auth;
  final ApiClient client;

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  Map<String, dynamic>? _summary;
  String? _error;
  bool _loading = false;

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
    // Прошлый месяц: текущий ещё не закончился, и «итог» по нему врёт.
    final month = now.month == 1 ? 12 : now.month - 1;
    final year = now.month == 1 ? now.year - 1 : now.year;

    try {
      _summary = await widget.client.getJson(
        '/finance/summary?year=$year&month=$month',
        token: token,
      );
    } catch (error) {
      _error = 'Не удалось загрузить отчёты';
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final summary = _summary;
    final totals = summary?['totals'] as Map<String, dynamic>?;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Отчёты'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), tooltip: 'Обновить', onPressed: _load),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
                child: Text(_error!, textAlign: TextAlign.center),
              )
            else if (totals == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
                child: Text('Данных пока нет.', textAlign: TextAlign.center),
              )
            else ...[
              Text(
                'Прошлый месяц',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: AppSpacing.sm),
              _Kpi(label: 'Поступления', value: _money(totals['received'])),
              _Kpi(label: 'Ожидалось', value: _money(summary?['expected'])),
              _Kpi(label: 'Долг', value: _money(summary?['debt'])),
              _Kpi(label: 'Должников', value: '${summary?['debtors'] ?? 0}'),
              const SizedBox(height: AppSpacing.md),
              const Text(
                'Отчёты доступны и в веб-админке — там же разбивка по филиалам и динамика.',
                style: TextStyle(color: AppColors.textSecondary),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: ListTile(
        title: Text(label),
        trailing: Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }
}

String _money(Object? value) {
  final number = value is num ? value.round() : 0;
  return '${number.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]} ')} ₽';
}
