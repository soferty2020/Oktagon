import 'package:flutter/material.dart';

import 'app_theme.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/home/member_home_controller.dart';
import 'features/news/news_controller.dart';
import 'features/schedule/schedule_controller.dart';
import 'features/shell/member_shell.dart';
import 'features/trainer/attendance_controller.dart';
import 'features/trainer/trainer_calendar_controller.dart';
import 'features/trainer/trainer_day_controller.dart';
import 'features/trainer/trainer_shell.dart';
import 'features/trainer/trainer_students_controller.dart';

/// Корневой виджет приложения.
///
/// Показывает экран входа или основную часть в зависимости от состояния сессии.
/// Проверка сохраненной сессии идет при запуске: если токены есть и живы,
/// человек не должен вводить пароль каждый раз.
class OctagonApp extends StatelessWidget {
  const OctagonApp({
    super.key,
    required this.authController,
    required this.memberHomeController,
    required this.scheduleController,
    required this.newsController,
    required this.trainerDayController,
    required this.trainerCalendarController,
    required this.trainerStudentsController,
    required this.attendanceFactory,
  });

  final AuthController authController;
  final MemberHomeController memberHomeController;
  final ScheduleController scheduleController;
  final NewsController newsController;

  final TrainerDayController trainerDayController;
  final TrainerCalendarController trainerCalendarController;
  final TrainerStudentsController trainerStudentsController;

  /// Фабрика журналов: у каждого занятия свой журнал, и состояние одного не
  /// должно переходить в другое.
  final AttendanceController Function() attendanceFactory;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'OCTAGON',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: ListenableBuilder(
        listenable: authController,
        builder: (context, _) {
          return switch (authController.status) {
            AuthStatus.checking => const _SplashScreen(),
            AuthStatus.unauthenticated => LoginScreen(controller: authController),
            AuthStatus.authenticated => _authenticatedScreen(),
          };
        },
      ),
    );
  }

  /// Экран после входа зависит от роли: приложение одно, но состав разделов
  /// разный (docs/10-mobile-app.md). Роль приходит с сервера, выбирать ее вручную
  /// нельзя.
  Widget _authenticatedScreen() {
    final role = authController.user?.role;

    if (role == 'MEMBER') {
      return MemberShell(
        auth: authController,
        home: memberHomeController,
        schedule: scheduleController,
        news: newsController,
      );
    }

    return TrainerShell(
      auth: authController,
      day: trainerDayController,
      calendar: trainerCalendarController,
      students: trainerStudentsController,
      news: newsController,
      attendanceFactory: attendanceFactory,
    );
  }
}

/// Заставка на время проверки сессии.
class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'OCTAGON',
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: 2),
            ),
            SizedBox(height: 24),
            CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
