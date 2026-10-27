import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../attendance/attendance_history_controller.dart';
import '../attendance/attendance_history_screen.dart';
import '../attendance/attendance_repository.dart';
import '../home/onboarding_repository.dart';
import '../auth/auth_controller.dart';
import '../chat/chat_controller.dart';
import '../chat/chats_controller.dart';
import '../chat/chats_screen.dart';
import '../home/member_home_controller.dart';
import '../home/member_home_screen.dart';
import '../news/news_controller.dart';
import '../news/news_screen.dart';
import '../sports/sports_controller.dart';
import '../sports/sports_screen.dart';
import '../profile/profile_screen.dart';
import '../schedule/schedule_controller.dart';
import '../schedule/schedule_screen.dart';

/// Основной каркас участника с нижней навигацией (docs/10-mobile-app.md).
///
/// Состав вкладок по макету: Главная, Расписание, Новости, Чат, Профиль.
///
/// Экраны держатся в `IndexedStack`: при переключении вкладок состояние не
/// теряется, и возврат на главную не перезагружает данные заново.
class MemberShell extends StatefulWidget {
  const MemberShell({
    super.key,
    required this.auth,
    required this.home,
    required this.schedule,
    required this.news,
    required this.sports,
    required this.chats,
    required this.attendance,
    this.onboarding,
    required this.chatFactory,
  });

  final AuthController auth;
  final MemberHomeController home;
  final ScheduleController schedule;
  final NewsController news;

  /// Мероприятия ребёнка: аттестации и соревнования (#41).
  final SportsController sports;
  final ChatsController chats;

  /// Нужен истории посещений и предупреждению об отсутствии (H5, H6).
  final AttendanceRepository attendance;

  /// Привязка ребёнка (ADR-0015): нужна, когда детей ещё нет.
  final OnboardingRepository? onboarding;

  /// Переписка создается на каждый диалог: состояние одной не должно переходить
  /// в другую.
  final ChatController Function() chatFactory;

  @override
  State<MemberShell> createState() => _MemberShellState();
}

class _MemberShellState extends State<MemberShell> {
  int _index = 0;

  /// История посещений открывается отдельным экраном: в нижнюю навигацию она не
  /// помещается (вкладок уже пять), а нужна точечно.
  Future<void> _openHistory(String? athleteId, String athleteName) async {
    if (athleteId == null) {
      return;
    }

    final controller = AttendanceHistoryController(repository: widget.attendance);

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => AttendanceHistoryScreen(
          auth: widget.auth,
          controller: controller,
          athleteId: athleteId,
          athleteName: athleteName,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListenableBuilder(
          listenable: widget.home,
          builder: (context, _) {
            final selected = widget.home.selected;

            return IndexedStack(
              index: _index,
              children: [
                MemberHomeContent(
                  auth: widget.auth,
                  controller: widget.home,
                  onboarding: widget.onboarding,
                  onOpenSchedule: () => setState(() => _index = 1),
                  onOpenNews: () => setState(() => _index = 2),
                  onOpenAttendance: () => _openHistory(selected?.id, selected?.firstName ?? ''),
                ),
                ScheduleScreen(
                  auth: widget.auth,
                  controller: widget.schedule,
                  attendance: widget.attendance,
                  athleteId: selected?.id,
                  athleteName: selected?.firstName ?? '',
                  groupId: widget.home.group?.id,
                  refreshKey: '${selected?.id ?? ''}:${widget.home.group?.id ?? ''}',
                ),
                NewsScreen(auth: widget.auth, controller: widget.news),
                SportsScreen(auth: widget.auth, controller: widget.sports),
                ChatsScreen(
                  auth: widget.auth,
                  controller: widget.chats,
                  chatFactory: widget.chatFactory,
                ),
                ProfileScreen(auth: widget.auth),
              ],
            );
          },
        ),
      ),
      bottomNavigationBar: ListenableBuilder(
        listenable: widget.chats,
        builder: (context, _) {
          final unread = widget.chats.unreadTotal;

          return NavigationBar(
            selectedIndex: _index,
            onDestinationSelected: (index) => setState(() => _index = index),
            destinations: [
              const NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home),
                label: 'Главная',
              ),
              const NavigationDestination(
                icon: Icon(Icons.calendar_month_outlined),
                selectedIcon: Icon(Icons.calendar_month),
                label: 'Расписание',
              ),
              const NavigationDestination(
                icon: Icon(Icons.campaign_outlined),
                selectedIcon: Icon(Icons.campaign),
                label: 'Новости',
              ),
              // Спорт: аттестации и соревнования ребёнка. Родитель только смотрит,
              // записи здесь нет — её оформляет тренер.
              const NavigationDestination(
                icon: Icon(Icons.sports_martial_arts_outlined),
                selectedIcon: Icon(Icons.sports_martial_arts),
                label: 'Спорт',
              ),
              NavigationDestination(
                // Значок с числом непрочитанных: иначе новое сообщение
                // обнаруживается только при заходе в раздел.
                icon: _ChatIcon(unread: unread),
                selectedIcon: _ChatIcon(unread: unread),
                label: 'Чат',
              ),
              const NavigationDestination(
                icon: Icon(Icons.person_outline),
                selectedIcon: Icon(Icons.person),
                label: 'Профиль',
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ChatIcon extends StatelessWidget {
  const _ChatIcon({required this.unread});

  final int unread;

  @override
  Widget build(BuildContext context) {
    final icon = Icon(unread > 0 ? Icons.chat_bubble : Icons.chat_bubble_outline);

    if (unread == 0) {
      return icon;
    }

    return Badge(
      label: Text(unread > 9 ? '9+' : '$unread'),
      backgroundColor: AppColors.accent,
      child: icon,
    );
  }
}
