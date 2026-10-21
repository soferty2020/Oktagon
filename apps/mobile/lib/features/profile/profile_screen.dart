import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';

/// Профиль (H9): кто вошел, с какими правами, и выход.
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
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                  child: Text(
                    (user?.firstName.isNotEmpty ?? false)
                        ? user!.firstName.characters.first
                        : '?',
                    style: const TextStyle(fontSize: 22),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.displayName ?? '',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        user?.email ?? '',
                        style: const TextStyle(color: Color(0xFF777777)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Доступ', style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 8),
                Text(
                  _roleLabel(user?.role),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 12),
                if ((user?.permissions.isEmpty ?? true))
                  const Text(
                    'Дополнительных прав нет.',
                    style: TextStyle(color: Color(0xFF777777)),
                  )
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final permission in user!.permissions)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF2F2F4),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            permission,
                            style: const TextStyle(fontSize: 12),
                          ),
                        ),
                    ],
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
        OutlinedButton.icon(
          onPressed: auth.busy ? null : auth.logout,
          icon: const Icon(Icons.logout),
          label: const Text('Выйти'),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
            foregroundColor: const Color(0xFFB3261E),
            side: const BorderSide(color: Color(0xFFE0C0BE)),
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
