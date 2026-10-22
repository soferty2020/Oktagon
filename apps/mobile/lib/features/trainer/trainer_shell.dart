import 'package:flutter/material.dart';

import '../../app_theme.dart';
import '../../design/tokens.dart';
import '../auth/auth_controller.dart';
import '../news/news_controller.dart';
import '../news/news_screen.dart';
import 'attendance_controller.dart';
import 'trainer_calendar_controller.dart';
import 'trainer_calendar_screen.dart';
import 'trainer_day_controller.dart';
import 'trainer_more_screen.dart';
import 'trainer_students_controller.dart';
import 'trainer_students_screen.dart';
import 'trainer_today_screen.dart';

/// Каркас приложения тренера (H10).
///
/// Тёмная шапка по макету: у тренера она визуально отделяет рабочий интерфейс от
/// клиентского приложения участника. Навигация: Сегодня, Календарь, Ученики, Ещё.
/// «Уведомлений» нет: отдельного раздела в API пока нет, а пустая вкладка
/// выглядела бы сломанной.
class TrainerShell extends StatefulWidget {
  const TrainerShell({
    super.key,
    required this.auth,
    required this.day,
    required this.calendar,
    required this.students,
    required this.news,
    required this.attendanceFactory,
  });

  final AuthController auth;
  final TrainerDayController day;
  final TrainerCalendarController calendar;
  final TrainerStudentsController students;
  final NewsController news;

  /// Журнал создается на каждое занятие: состояние одного журнала нельзя
  /// переиспользовать для другого.
  final AttendanceController Function() attendanceFactory;

  @override
  State<TrainerShell> createState() => _TrainerShellState();
}

class _TrainerShellState extends State<TrainerShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.dark,
        foregroundColor: Colors.white,
        title: const _Logo(),
        titleTextStyle: const TextStyle(color: Colors.white),
        actions: [
          IconButton(
            tooltip: 'Новости',
            icon: const Icon(Icons.campaign_outlined, color: Colors.white, size: 22),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => Scaffold(
                  body: SafeArea(
                    child: Column(
                      children: [
                        AppBar(
                          backgroundColor: AppColors.dark,
                          foregroundColor: Colors.white,
                          leading: IconButton(
                            icon: const Icon(Icons.arrow_back),
                            onPressed: () => Navigator.of(context).maybePop(),
                          ),
                          title: const Text('Новости'),
                        ),
                        Expanded(
                          child: NewsScreen(auth: widget.auth, controller: widget.news),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: IndexedStack(
          index: _index,
          children: [
            TrainerTodayScreen(
              auth: widget.auth,
              controller: widget.day,
              attendanceFactory: widget.attendanceFactory,
            ),
            TrainerCalendarScreen(auth: widget.auth, controller: widget.calendar),
            TrainerStudentsScreen(auth: widget.auth, controller: widget.students),
            TrainerMoreScreen(auth: widget.auth),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (index) => setState(() => _index = index),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.today_outlined),
            selectedIcon: Icon(Icons.today),
            label: 'Сегодня',
          ),
          NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            selectedIcon: Icon(Icons.calendar_month),
            label: 'Календарь',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'Ученики',
          ),
          NavigationDestination(
            icon: Icon(Icons.more_horiz),
            selectedIcon: Icon(Icons.more_horiz),
            label: 'Ещё',
          ),
        ],
      ),
    );
  }
}

/// Логотип в шапке: «OCTAGON» с оранжевой полосой, как на макете.
class _Logo extends StatelessWidget {
  const _Logo();

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'OCTAGON',
          style: AppTheme.light().textTheme.titleLarge?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.5,
              ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Container(
          width: 22,
          height: 3,
          decoration: BoxDecoration(
            color: AppColors.accent,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
      ],
    );
  }
}
