import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../design/tokens.dart';
import '../attestations/attestation_controller.dart';
import '../attestations/attestations_screen.dart';
import '../auth/auth_controller.dart';
import 'reports_screen.dart';
import 'trial_requests_screen.dart';

/// Каркас приложения руководителя клуба.
///
/// Раньше суперадмин попадал в тренерский каркас просто потому, что условие было
/// `if MEMBER else Trainer`. Владельцу клуба нужны заявки (они приходят с сайта и
/// требуют быстрого ответа), аттестации и отчёты — не «Ученики» тренера.
class AdminShell extends StatefulWidget {
  const AdminShell({
    super.key,
    required this.auth,
    required this.attestations,
    required this.trialRequests,
    required this.client,
  });

  final AuthController auth;
  final AttestationController attestations;
  final TrialRequestsController trialRequests;
  final ApiClient client;

  @override
  State<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends State<AdminShell> {
  int _index = 1;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.dark,
        foregroundColor: Colors.white,
        title: const Text('OCTAGON', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
      ),
      body: SafeArea(
        child: IndexedStack(
          index: _index,
          children: [
            TrialRequestsScreen(auth: widget.auth, controller: widget.trialRequests),
            AttestationsScreen(auth: widget.auth, controller: widget.attestations),
            ReportsScreen(auth: widget.auth, client: widget.client),
            _AdminMoreScreen(auth: widget.auth),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (index) => setState(() => _index = index),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.inbox_outlined),
            selectedIcon: Icon(Icons.inbox),
            label: 'Заявки',
          ),
          NavigationDestination(
            icon: Icon(Icons.sports_martial_arts_outlined),
            selectedIcon: Icon(Icons.sports_martial_arts),
            label: 'Аттестации',
          ),
          NavigationDestination(
            icon: Icon(Icons.bar_chart_outlined),
            selectedIcon: Icon(Icons.bar_chart),
            label: 'Отчёты',
          ),
          NavigationDestination(
            icon: Icon(Icons.more_horiz),
            selectedIcon: Icon(Icons.more_horiz),
            label: 'Ещё',
          ),
        ],
      ),
    );
  }
}

/// «Ещё» для руководителя: профиль и выход.
class _AdminMoreScreen extends StatelessWidget {
  const _AdminMoreScreen({required this.auth});

  final AuthController auth;

  @override
  Widget build(BuildContext context) {
    final user = auth.user;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Text('Ещё', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 16),
        if (user != null) ...[
          Text(user.displayName, style: Theme.of(context).textTheme.titleMedium),
          Text(user.email, style: const TextStyle(color: Colors.black54)),
          const SizedBox(height: 24),
        ],
        const Text(
          'Соревнования, справочник категорий и заявки на турниры — в веб-админке.',
          style: TextStyle(color: Colors.black54),
        ),
        const SizedBox(height: 24),
        OutlinedButton(
          onPressed: () => auth.logout(),
          child: const Text('Выйти'),
        ),
      ],
    );
  }
}

