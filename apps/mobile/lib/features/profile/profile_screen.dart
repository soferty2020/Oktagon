import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../auth/auth_controller.dart';

/// Профиль (H9), оформление по макету: аватар, имя, роль, права, выход.
///
/// Права показываются списком: если ожидаемого раздела нет в навигации, причина
/// видна здесь, а не выясняется перебором экранов.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key, required this.auth});

  final AuthController auth;

  @override
  Widget build(BuildContext context) {
    final user = auth.user;

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.xxl,
      ),
      children: [
        Text('Профиль', style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: AppSpacing.lg),

        // Карточка пользователя: аватар, имя, email.
        Row(
          children: [
            CircleAvatar(
              radius: 32,
              backgroundColor: AppColors.accentSoft,
              child: Text(
                (user?.firstName.isNotEmpty ?? false)
                    ? user!.firstName.characters.first
                    : '?',
                style: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w700,
                  color: AppColors.accent,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.lg),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    user?.displayName ?? '',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    user?.email ?? '',
                    style: const TextStyle(color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
          ],
        ),

        const SizedBox(height: AppSpacing.xl),

        // Строки сведений: разделены линиями, как в макете.
        Container(
          decoration: BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.circular(AppRadius.card),
            border: Border.all(color: AppColors.divider),
          ),
          child: Column(
            children: [
              _InfoRow(
                icon: Icons.badge_outlined,
                label: 'Роль',
                value: _roleLabel(user?.role),
              ),
              const Divider(height: 1),
              _InfoRow(
                icon: Icons.verified_user_outlined,
                label: 'Прав',
                value: '${user?.permissions.length ?? 0}',
              ),
            ],
          ),
        ),

        if (user != null && user.permissions.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.lg),
          Text(
            'Доступные действия',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final permission in user.permissions)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                    vertical: AppSpacing.xs,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceMuted,
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                  child: Text(
                    permission,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
            ],
          ),
        ],

        const SizedBox(height: AppSpacing.xxl),

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

  String _roleLabel(String? role) {
    return switch (role) {
      'MEMBER' => 'Участник клуба',
      'STAFF' => 'Сотрудник клуба',
      'SUPERADMIN' => 'Суперадминистратор',
      _ => role ?? 'неизвестно',
    };
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
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.lg,
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.textSecondary),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(color: AppColors.textSecondary),
            ),
          ),
          Text(
            value,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}
