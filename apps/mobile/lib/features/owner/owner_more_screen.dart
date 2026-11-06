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
import 'owner_competitions_screen.dart';
import 'owner_sections.dart';

/// «Ещё»: разделы вне нижней навигации.
///
/// Состав и права — в [ownerSections]: раздел виден, только если у владельца
/// есть соответствующее право. Экраны не переписаны — открываются те же, что
/// у тренера и спортсмена.
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
    final permissions = user?.permissions ?? const <String>[];

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
        for (final section in ownerSections)
          if (section.isVisible(permissions))
            _MenuTile(
              icon: section.icon,
              label: section.label,
              onTap: () => _open(section.id),
            ),
      ],
    );
  }

  void _open(String id) {
    switch (id) {
      case 'trial_requests':
        onOpen(TrialRequestsScreen(auth: auth, controller: trialRequests));
      case 'attestations':
        onOpen(AttestationsScreen(auth: auth, controller: attestations));
      case 'competitions':
        onOpen(OwnerCompetitionsScreen(auth: auth, client: client));
      case 'reports':
        onOpen(ReportsScreen(auth: auth, client: client));
      case 'news':
        onOpen(NewsScreen(auth: auth, controller: news));
      case 'chats':
        onOpen(ChatsScreen(auth: auth, controller: chats, chatFactory: chatFactory));
      case 'profile':
        onOpen(ProfileScreen(auth: auth));
    }
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
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      // Material обязателен: ListTile рисует фон и всплеск на ближайшем Material,
      // а цветной Container их скрывает (Flutter предупреждает об этом).
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        clipBehavior: Clip.antiAlias,
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
