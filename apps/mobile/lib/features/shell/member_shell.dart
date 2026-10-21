import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import '../home/member_home_controller.dart';
import '../home/member_home_screen.dart';
import '../news/news_controller.dart';
import '../news/news_screen.dart';
import '../profile/profile_screen.dart';
import '../schedule/schedule_controller.dart';
import '../schedule/schedule_screen.dart';

/// Основной каркас участника с нижней навигацией (docs/10-mobile-app.md).
///
/// Состав вкладок по документу: Главная, Расписание, Чат, Новости, Профиль. Чата
/// пока нет (H8), поэтому вкладок четыре: пустая вкладка «Чат» выглядела бы как
/// сломанная.
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
  });

  final AuthController auth;
  final MemberHomeController home;
  final ScheduleController schedule;
  final NewsController news;

  @override
  State<MemberShell> createState() => _MemberShellState();
}

class _MemberShellState extends State<MemberShell> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    // Главная загружает спортсменов и данные по основному при первом показе.
    // Остальные вкладки подгружаются при открытии, чтобы не делать лишние
    // запросы сразу после входа.
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
                ),
                ScheduleScreen(
                  auth: widget.auth,
                  controller: widget.schedule,
                  athleteName: selected?.firstName ?? '',
                  groupId: widget.home.group?.id,
                  refreshKey: '${selected?.id ?? ''}:${widget.home.group?.id ?? ''}',
                ),
                NewsScreen(auth: widget.auth, controller: widget.news),
                ProfileScreen(auth: widget.auth),
              ],
            );
          },
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (index) => setState(() => _index = index),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Главная',
          ),
          NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            selectedIcon: Icon(Icons.calendar_month),
            label: 'Расписание',
          ),
          NavigationDestination(
            icon: Icon(Icons.campaign_outlined),
            selectedIcon: Icon(Icons.campaign),
            label: 'Новости',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Профиль',
          ),
        ],
      ),
    );
  }
}
