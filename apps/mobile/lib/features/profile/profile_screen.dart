import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../auth/auth_controller.dart';
import 'permission_labels.dart';

/// Профиль: кто вошёл, что может и выход.
///
/// Технические коды прав не показываются в основном интерфейсе: роль и уровень
/// доступа видны сразу, а подробности — в сворачиваемом разделе «Права и
/// возможности» с русскими названиями по областям.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key, required this.auth});

  final AuthController auth;

  @override
  Widget build(BuildContext context) {
    final user = auth.user;
    final permissions = user?.permissions ?? const <String>[];
    final groups = visiblePermissionGroups(permissions);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        Text('Профиль', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 16),
        Row(
          children: [
            CircleAvatar(
              radius: 28,
              backgroundColor: AppColors.accentSoft,
              child: Text(
                (user?.firstName.isNotEmpty ?? false)
                    ? user!.firstName.characters.first.toUpperCase()
                    : '?',
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: AppColors.accentDark,
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(user?.displayName ?? '',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 2),
                  Text(user?.email ?? '',
                      style: const TextStyle(color: AppColors.textSecondary)),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(AppRadius.card),
            border: Border.all(color: AppColors.divider),
          ),
          child: Column(
            children: [
              _InfoRow(
                icon: Icons.badge_outlined,
                label: 'Роль',
                value: roleTitle(user?.role),
              ),
              const Divider(height: 1),
              _InfoRow(
                icon: Icons.verified_user_outlined,
                label: 'Уровень доступа',
                value: accessLevel(user?.role),
              ),
            ],
          ),
        ),
        if (groups.isNotEmpty) ...[
          const SizedBox(height: 16),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(AppRadius.card),
              border: Border.all(color: AppColors.divider),
            ),
            clipBehavior: Clip.antiAlias,
            child: Theme(
              // Убираем разделители ExpansionTile по умолчанию: карточка уже
              // обрамлена, лишние линии выглядят как сломанная вёрстка.
              data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                tilePadding: const EdgeInsets.symmetric(horizontal: 14),
                childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
                leading: const Icon(Icons.key_outlined, size: 20),
                title: const Text('Права и возможности',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                subtitle: Text(
                  permissions.isEmpty
                      ? 'Права не выданы'
                      : '${groups.length} областей · ${permissions.length} прав',
                  style: const TextStyle(fontSize: 12),
                ),
                children: [
                  for (final group in groups) ...[
                    Padding(
                      padding: const EdgeInsets.only(top: 10, bottom: 4),
                      child: Row(
                        children: [
                          Icon(permissionGroupIcon(group.title),
                              size: 16, color: AppColors.textSecondary),
                          const SizedBox(width: 8),
                          Text(group.title,
                              style: const TextStyle(
                                  fontSize: 12, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                    for (final code in group.codes.where(permissions.contains))
                      Padding(
                        padding: const EdgeInsets.only(left: 24, top: 3),
                        child: Row(
                          children: [
                            const Icon(Icons.check,
                                size: 14, color: AppColors.success),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(permissionLabel(code),
                                  style: const TextStyle(fontSize: 12)),
                            ),
                          ],
                        ),
                      ),
                  ],
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 24),
        OutlinedButton.icon(
          onPressed: auth.busy ? null : auth.logout,
          icon: const Icon(Icons.logout, size: 18),
          label: const Text('Выйти'),
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.danger,
            side: const BorderSide(color: AppColors.divider),
          ),
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.textSecondary),
          const SizedBox(width: 12),
          Expanded(
            child: Text(label, style: const TextStyle(color: AppColors.textSecondary)),
          ),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
