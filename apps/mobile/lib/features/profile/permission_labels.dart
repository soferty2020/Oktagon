import 'package:flutter/material.dart';

/// Русские названия прав доступа.
///
/// В интерфейсе не показываются технические коды вида `athletes.contacts.view`:
/// владелец видит «Контакты спортсменов», сгруппированные по областям.
class PermissionGroup {
  const PermissionGroup({required this.title, required this.codes});

  final String title;
  final List<String> codes;
}

const List<PermissionGroup> permissionGroups = [
  PermissionGroup(
    title: 'Спортсмены и группы',
    codes: [
      'athletes.view',
      'athletes.edit',
      'athletes.contacts.view',
      'groups.view',
      'groups.edit',
    ],
  ),
  PermissionGroup(
    title: 'Расписание и посещаемость',
    codes: [
      'schedule.view',
      'schedule.edit',
      'schedule.cancel',
      'schedule.change_trainer',
      'schedule.change_location',
      'attendance.view',
      'attendance.edit',
    ],
  ),
  PermissionGroup(
    title: 'Аттестации и соревнования',
    codes: [
      'attestations.view',
      'attestations.manage',
      'attestations.results',
      'competitions.view',
      'competitions.manage',
      'competitions.results',
    ],
  ),
  PermissionGroup(
    title: 'Финансы и отчёты',
    codes: [
      'payments.view',
      'payments.edit',
      'freezes.view',
      'freezes.edit',
      'finance.view',
      'reports.view',
      'analytics.view',
    ],
  ),
  PermissionGroup(
    title: 'Новости и коммуникации',
    codes: [
      'news.create',
      'news.edit',
      'news.delete',
      'news.moderate',
      'news.view',
      'chat.use',
      'trial_requests.view',
      'trial_requests.manage',
    ],
  ),
  PermissionGroup(
    title: 'Управление пользователями и настройками',
    codes: [
      'branches.view',
      'branches.manage',
      'users.manage',
      'permissions.manage',
      'audit.view',
      'settings.manage',
    ],
  ),
];

const Map<String, String> permissionLabels = {
  'athletes.view': 'Просмотр спортсменов',
  'athletes.edit': 'Редактирование спортсменов',
  'athletes.contacts.view': 'Контакты спортсменов',
  'groups.view': 'Просмотр групп',
  'groups.edit': 'Редактирование групп',
  'attendance.view': 'Просмотр посещаемости',
  'attendance.edit': 'Отметка посещаемости',
  'schedule.view': 'Просмотр расписания',
  'schedule.edit': 'Редактирование расписания',
  'schedule.cancel': 'Отмена занятий',
  'schedule.change_trainer': 'Смена тренера',
  'schedule.change_location': 'Перенос в другой зал',
  'payments.view': 'Просмотр оплат',
  'payments.edit': 'Начисление и приём оплат',
  'freezes.view': 'Просмотр заморозок',
  'freezes.edit': 'Заморозка занятий',
  'news.create': 'Создание новостей',
  'news.edit': 'Редактирование новостей',
  'news.delete': 'Удаление новостей',
  'news.moderate': 'Модерация новостей',
  'news.view': 'Просмотр новостей',
  'chat.use': 'Общение в чатах',
  'branches.view': 'Просмотр филиалов',
  'branches.manage': 'Управление филиалами и залами',
  'users.manage': 'Управление сотрудниками',
  'permissions.manage': 'Выдача прав доступа',
  'attestations.view': 'Просмотр аттестаций',
  'attestations.manage': 'Организация аттестаций',
  'attestations.results': 'Внесение результатов аттестаций',
  'competitions.view': 'Просмотр соревнований',
  'competitions.manage': 'Организация соревнований',
  'competitions.results': 'Внесение результатов соревнований',
  'finance.view': 'Просмотр финансов',
  'reports.view': 'Просмотр отчётов',
  'analytics.view': 'Аналитика',
  'trial_requests.view': 'Просмотр заявок',
  'trial_requests.manage': 'Обработка заявок',
  'audit.view': 'Журнал действий',
  'settings.manage': 'Настройки клуба',
};

String permissionLabel(String code) => permissionLabels[code] ?? code;

/// Группы, в которых у пользователя есть хотя бы одно право.
List<PermissionGroup> visiblePermissionGroups(List<String> permissions) {
  final owned = permissions.toSet();
  return permissionGroups
      .where((group) => group.codes.any(owned.contains))
      .toList(growable: false);
}

/// Подпись роли для профиля.
String roleTitle(String? role) => switch (role) {
      'SUPERADMIN' => 'Руководитель клуба',
      'STAFF' => 'Сотрудник клуба',
      'MEMBER' => 'Участник клуба',
      _ => 'Пользователь',
    };

/// Уровень доступа: у владельца он полный по определению роли.
String accessLevel(String? role) => switch (role) {
      'SUPERADMIN' => 'Полный доступ',
      'STAFF' => 'По выданным правам',
      'MEMBER' => 'Личный кабинет',
      _ => 'Ограниченный',
    };

/// Иконка группы — по области, а не по коду.
IconData permissionGroupIcon(String title) => switch (title) {
      'Спортсмены и группы' => Icons.people_outline,
      'Расписание и посещаемость' => Icons.calendar_today_outlined,
      'Аттестации и соревнования' => Icons.workspace_premium_outlined,
      'Финансы и отчёты' => Icons.account_balance_wallet_outlined,
      'Новости и коммуникации' => Icons.chat_bubble_outline,
      _ => Icons.settings_outlined,
    };
