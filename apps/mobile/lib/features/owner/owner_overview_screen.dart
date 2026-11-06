import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../design/tokens.dart';
import '../../core/club_clock.dart';
import '../auth/auth_controller.dart';
import 'owner_session_details_screen.dart';

/// Обзор клуба для владельца.
///
/// Один экран отвечает на вопрос «что происходит»: сколько спортсменов,
/// сколько денег, что требует внимания и какие занятия сегодня. Данные
/// собираются из тех же эндпоинтов, что и веб-админка.
class OwnerOverviewScreen extends StatefulWidget {
  const OwnerOverviewScreen({
    super.key,
    required this.auth,
    required this.client,
    required this.onOpen,
    this.onOpenTrialRequests,
    this.onOpenTab,
  });

  final AuthController auth;
  final ApiClient client;
  final void Function(Widget screen) onOpen;

  /// Переход к заявкам по нажатию на KPI: заявки живут в «Ещё», но владелец
  /// должен попадать в них с обзора.
  final VoidCallback? onOpenTrialRequests;

  /// Переключение нижней вкладки: 0 — обзор, 1 — спортсмены, 2 — расписание,
  /// 3 — финансы, 4 — «Ещё».
  final void Function(int index)? onOpenTab;

  @override
  State<OwnerOverviewScreen> createState() => _OwnerOverviewScreenState();
}

class _OwnerOverviewScreenState extends State<OwnerOverviewScreen> {
  bool _loading = true;
  String? _error;

  int _athletes = 0;
  int _groups = 0;
  int _sessionsToday = 0;
  int _trialRequests = 0;
  int _debtorsWithoutExpected = 0;
  int _debt = 0;
  int _revenue = 0;
  List<Map<String, dynamic>> _todaySessions = [];
  Map<String, dynamic>? _nextAttestation;

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
    final today = ClubClock.dayRange(now);

    try {
      final results = await Future.wait([
        widget.client.getJson('/athletes?page=1&limit=1', token: token),
        widget.client.getJson('/groups', token: token),
        widget.client.getJson(
          '/training-sessions?from=${today.from}&to=${today.to}',
          token: token,
        ),
        widget.client.getJson('/trial-requests', token: token),
        widget.client.getJson(
          '/finance/summary?year=${now.year}&month=${now.month}',
          token: token,
        ),
        widget.client.getJson('/certification-events', token: token),
      ]);

      final athletes = results[0];
      final groups = results[1];
      final sessions = results[2];
      final trials = results[3];
      final finance = results[4];
      final certifications = results[5];

      if (!mounted) {
        return;
      }
      setState(() {
        _athletes = (athletes['total'] as num?)?.toInt() ?? 0;
        _groups = _listOf(groups).length;
        _todaySessions = _listOf(sessions);
        _sessionsToday = _todaySessions.length;
        _trialRequests = _listOf(trials).length;
        _debt = (finance['debt'] as num?)?.toInt() ?? 0;
        _revenue = ((finance['totals'] as Map?)?['revenue'] as num?)?.toInt() ?? 0;
        _debtorsWithoutExpected =
            (finance['debtorsWithoutExpected'] as num?)?.toInt() ?? 0;
        _nextAttestation = _listOf(certifications).firstOrNull;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Не удалось загрузить данные клуба');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          Text('Обзор клуба', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text(_todayLabel(), style: const TextStyle(color: AppColors.textSecondary)),
          const SizedBox(height: 16),
          if (_loading) const _OverviewSkeleton(),
          if (_error != null) _ErrorCard(message: _error!, onRetry: _load),
          if (!_loading && _error == null) ...[
            _KpiGrid(
              athletes: _athletes,
              groups: _groups,
              revenue: _revenue,
              debt: _debt,
              sessions: _sessionsToday,
              trials: _trialRequests,
              onTapAthletes: () => widget.onOpenTab?.call(1),
              onTapRevenue: () => widget.onOpenTab?.call(3),
              onTapSessions: () => widget.onOpenTab?.call(2),
              onTapRequests: widget.onOpenTrialRequests,
            ),
            const SizedBox(height: 20),
            if (_debtorsWithoutExpected > 0 || _nextAttestation != null) ...[
              const _SectionTitle('Требует внимания'),
              const SizedBox(height: 8),
              if (_debtorsWithoutExpected > 0)
                _AttentionCard(
                  icon: Icons.shield_outlined,
                  tone: AppColors.danger,
                  title: '$_debtorsWithoutExpected спортсменов без суммы',
                  subtitle: 'долг не считается, пока не задан тариф',
                  onTap: () => widget.onOpenTab?.call(3),
                ),
              if (_nextAttestation != null)
                _AttentionCard(
                  icon: Icons.workspace_premium_outlined,
                  tone: AppColors.accent,
                  title: _nextAttestation!['title'] as String? ?? 'Аттестация',
                  subtitle: _attestationSubtitle(_nextAttestation!),
                  onTap: () => widget.onOpenTab?.call(4),
                ),
              const SizedBox(height: 20),
            ],
            const _SectionTitle('Сегодня'),
            const SizedBox(height: 8),
            if (_todaySessions.isEmpty)
              const _EmptyCard(
                title: 'Занятий нет',
                subtitle: 'На этот день расписание пустое',
              )
            else
              ..._todaySessions.take(4).map(
                    (session) => _SessionCard(
                      session: session,
                      onTap: () => widget.onOpen(
                        OwnerSessionDetailsScreen(session: session),
                      ),
                    ),
                  ),
          ],
        ],
      ),
    );
  }

  String _todayLabel() {
    final now = ClubClock.todayInClub();
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];
    return 'Сегодня, ${now.day} ${months[now.month - 1]}';
  }

  String _attestationSubtitle(Map<String, dynamic> event) {
    final participants = (event['participantsCount'] as num?)?.toInt() ?? 0;
    final raw = event['scheduledAt'] as String?;
    if (raw == null) {
      return '$participants участников';
    }
    final date = DateTime.tryParse(raw)?.toLocal();
    if (date == null) {
      return '$participants участников';
    }
    return '${date.day}.${date.month.toString().padLeft(2, '0')}.${date.year} · '
        '$participants участников';
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
    );
  }
}

class _KpiGrid extends StatelessWidget {
  const _KpiGrid({
    required this.athletes,
    required this.groups,
    required this.revenue,
    required this.debt,
    required this.sessions,
    required this.trials,
    this.onTapAthletes,
    this.onTapRevenue,
    this.onTapSessions,
    this.onTapRequests,
  });

  final int athletes;
  final int groups;
  final int revenue;
  final int debt;
  final int sessions;
  final int trials;
  final VoidCallback? onTapAthletes;
  final VoidCallback? onTapRevenue;
  final VoidCallback? onTapSessions;
  final VoidCallback? onTapRequests;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.65,
      children: [
        _Kpi(label: 'Спортсмены', value: '$athletes', hint: '$groups групп', onTap: onTapAthletes),
        _Kpi(
          label: 'Выручка',
          value: _money(revenue),
          hint: debt > 0 ? 'долг ${_money(debt)}' : 'за этот месяц',
          onTap: onTapRevenue,
        ),
        _Kpi(label: 'Занятия сегодня', value: '$sessions', hint: 'по расписанию', onTap: onTapSessions),
        _Kpi(label: 'Новые заявки', value: '$trials', hint: 'ожидают ответа', onTap: onTapRequests),
      ],
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi({
    required this.label,
    required this.value,
    required this.hint,
    this.onTap,
  });

  final String label;
  final String value;
  final String hint;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final content = Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(height: 2),
          Text(hint, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        ],
      ),
    );

    if (onTap == null) {
      return content;
    }
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.card),
      child: content,
    );
  }
}

class _AttentionCard extends StatelessWidget {
  const _AttentionCard({
    required this.icon,
    required this.tone,
    required this.title,
    required this.subtitle,
    this.onTap,
  });

  final IconData icon;
  final Color tone;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final content = Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: tone, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );

    if (onTap == null) {
      return content;
    }
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.card),
      child: content,
    );
  }
}

class _SessionCard extends StatelessWidget {
  const _SessionCard({required this.session, required this.onTap});

  final Map<String, dynamic> session;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final start = session['startsAt'] as String?;
    final time = start == null ? '—' : _time(start);
    final group = session['groupName'] as String? ?? 'Группа не указана';
    final hall = session['hallName'] as String?;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.card),
      child: Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: const Border(left: BorderSide(color: AppColors.accent, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(time, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(group, style: const TextStyle(fontWeight: FontWeight.w600)),
          if (hall != null) ...[
            const SizedBox(height: 2),
            Text(hall, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          ],
        ],
      ),
      ),
    );
  }

  String _time(String iso) => ClubClock.formatTime(iso);
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.title, required this.subtitle});

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
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message, required this.onRetry});

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

class _OverviewSkeleton extends StatelessWidget {
  const _OverviewSkeleton();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.65,
          children: List.generate(4, (_) => const _SkeletonBox()),
        ),
        const SizedBox(height: 20),
        const _SkeletonBox(height: 64),
      ],
    );
  }
}

class _SkeletonBox extends StatelessWidget {
  const _SkeletonBox({this.height = 72});

  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
    );
  }
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

/// Список из ответа API: клиент оборачивает массивы в `data`, а страницы —
/// отдают `items`. Один разбор на все экраны владельца.
List<Map<String, dynamic>> _listOf(Map<String, dynamic> response) {
  final raw = response['data'] ?? response['items'];
  if (raw is List) {
    return raw.whereType<Map<String, dynamic>>().toList();
  }
  return const [];
}