import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../design/tokens.dart';
import '../admin/reports_screen.dart';
import '../admin/trial_requests_screen.dart';
import '../attestations/attestation_controller.dart';
import '../attestations/attestations_screen.dart';
import '../auth/auth_controller.dart';
import '../chat/chat_controller.dart';
import '../chat/chats_controller.dart';
import '../chat/chats_screen.dart';
import '../news/news_controller.dart';
import '../news/news_screen.dart';
import '../profile/profile_screen.dart';

/// «Ещё»: разделы, которые не помещаются в нижнюю навигацию.
///
/// Экраны не переписаны заново — открываются существующие, написанные для
/// тренера и спортсмена. Это и есть переиспользование: один код, разные роли.
class OwnerMoreScreen extends StatelessWidget {
  const OwnerMoreScreen({
    super.key,
    required this.auth,
    required this.client,
    required this.attestations,
    required this.trialRequests,
    required this.news,
    required this.chats,
    required this.chatFactory,
    required this.onOpen,
  });

  final AuthController auth;
  final ApiClient client;
  final AttestationController attestations;
  final TrialRequestsController trialRequests;
  final NewsController news;
  final ChatsController chats;
  final ChatController Function() chatFactory;
  final void Function(Widget screen) onOpen;

  @override
  Widget build(BuildContext context) {
    final user = auth.user;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        Text('Ещё', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 4),
        Text(
          user == null ? '' : '${_roleLabel(user.role)} · ${user.email}',
          style: const TextStyle(color: AppColors.textSecondary),
        ),
        const SizedBox(height: 16),
        _MenuTile(
          icon: Icons.inbox_outlined,
          label: 'Заявки',
          onTap: () => onOpen(
            TrialRequestsScreen(auth: auth, controller: trialRequests),
          ),
        ),
        _MenuTile(
          icon: Icons.workspace_premium_outlined,
          label: 'Аттестации',
          onTap: () => onOpen(
            AttestationsScreen(auth: auth, controller: attestations),
          ),
        ),
        _MenuTile(
          icon: Icons.bar_chart_outlined,
          label: 'Отчёты',
          onTap: () => onOpen(ReportsScreen(auth: auth, client: client)),
        ),
        _MenuTile(
          icon: Icons.newspaper_outlined,
          label: 'Новости',
          onTap: () => onOpen(NewsScreen(auth: auth, controller: news)),
        ),
        _MenuTile(
          icon: Icons.chat_bubble_outline,
          label: 'Чаты',
          onTap: () => onOpen(
            ChatsScreen(auth: auth, controller: chats, chatFactory: chatFactory),
          ),
        ),
        _MenuTile(
          icon: Icons.person_outline,
          label: 'Профиль',
          onTap: () => onOpen(ProfileScreen(auth: auth)),
        ),
      ],
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: ListTile(
        leading: Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: AppColors.accentSoft,
            borderRadius: BorderRadius.circular(9),
          ),
          child: Icon(icon, size: 17, color: AppColors.accentDark),
        ),
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w500)),
        trailing: const Icon(Icons.chevron_right, color: AppColors.textTertiary),
        onTap: onTap,
      ),
    );
  }
}

String _roleLabel(String? role) => switch (role) {
      'SUPERADMIN' => 'Владелец клуба',
      'STAFF' => 'Сотрудник',
      'MEMBER' => 'Спортсмен',
      _ => 'Пользователь',
    };