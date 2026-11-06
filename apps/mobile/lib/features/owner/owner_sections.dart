import 'package:flutter/material.dart';

/// Разделы владельца с правом доступа.
///
/// Один список вместо трёх shell-ов: раздел показывается, если у пользователя
/// есть хотя бы одно из указанных прав. Это та же модель, что в веб-админке
/// (`ATHLETE_TABS`), и она же пригодится другим ролям — тренеру и сотруднику.
class OwnerSection {
  const OwnerSection({
    required this.id,
    required this.label,
    required this.icon,
    this.anyOfPermissions = const [],
  });

  final String id;
  final String label;
  final IconData icon;

  /// Пусто — раздел доступен всем авторизованным.
  final List<String> anyOfPermissions;

  bool isVisible(List<String> permissions) {
    if (anyOfPermissions.isEmpty) {
      return true;
    }
    return anyOfPermissions.any(permissions.contains);
  }
}

const List<OwnerSection> ownerSections = [
  OwnerSection(
    id: 'trial_requests',
    label: 'Заявки',
    icon: Icons.inbox_outlined,
    anyOfPermissions: ['trial_requests.view', 'trial_requests.manage'],
  ),
  OwnerSection(
    id: 'attestations',
    label: 'Аттестации',
    icon: Icons.workspace_premium_outlined,
    anyOfPermissions: ['attestations.view'],
  ),
  OwnerSection(
    id: 'competitions',
    label: 'Соревнования',
    icon: Icons.emoji_events_outlined,
    anyOfPermissions: ['competitions.view'],
  ),
  OwnerSection(
    id: 'reports',
    label: 'Отчёты',
    icon: Icons.bar_chart_outlined,
    anyOfPermissions: ['finance.view', 'reports.view'],
  ),
  OwnerSection(
    id: 'news',
    label: 'Новости',
    icon: Icons.newspaper_outlined,
    anyOfPermissions: ['news.view'],
  ),
  OwnerSection(
    id: 'chats',
    label: 'Чаты',
    icon: Icons.chat_bubble_outline,
  ),
  OwnerSection(
    id: 'profile',
    label: 'Профиль',
    icon: Icons.person_outline,
  ),
];
