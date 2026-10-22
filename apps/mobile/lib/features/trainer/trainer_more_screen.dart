import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../auth/auth_controller.dart';

/// Раздел «Ещё» тренера (H10): профиль и выход.
///
/// Отдельного экрана профиля у тренера нет — он не нужен: тренер меняет данные
/// через администратора, а здесь важно видеть, под кем он вошел, и выйти.
class TrainerMoreScreen extends StatelessWidget {
  const TrainerMoreScreen({super.key, required this.auth});

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
        Text('Ещё', style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: AppSpacing.lg),

        Row(
          children: [
            CircleAvatar(
              radius: 28,
              backgroundColor: AppColors.accentSoft,
              child: Text(
                (user?.firstName.isNotEmpty ?? false)
                    ? user!.firstName.characters.first
                    : '?',
                style: const TextStyle(
                  fontSize: 22,
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

        Container(
          decoration: BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.circular(AppRadius.card),
            border: Border.all(color: AppColors.divider),
          ),
          child: Column(
            children: [
              _Row(icon: Icons.badge_outlined, label: 'Роль', value: _roleLabel(user?.role)),
              const Divider(height: 1),
              _Row(
                icon: Icons.verified_user_outlined,
                label: 'Прав',
                value: '${user?.permissions.length ?? 0}',
              ),
            ],
          ),
        ),

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

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.label, required this.value});

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
            child: Text(label, style: const TextStyle(color: AppColors.textSecondary)),
          ),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
