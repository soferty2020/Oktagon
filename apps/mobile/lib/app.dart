import 'package:flutter/material.dart';

import 'app_theme.dart';
import 'core/api_client.dart';
import 'features/attendance/attendance_repository.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/chat/chat_controller.dart';
import 'features/chat/chats_controller.dart';
import 'features/home/member_home_controller.dart';
import 'features/news/news_controller.dart';
import 'features/schedule/schedule_controller.dart';
import 'features/admin/admin_shell.dart';
import 'features/admin/trial_requests_screen.dart';
import 'features/attestations/attestation_controller.dart';
import 'features/shell/member_shell.dart';
import 'features/sports/sports_controller.dart';
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
    required this.sportsController,
    required this.chatsController,
    required this.attendanceRepository,
    required this.trainerDayController,
    required this.trainerCalendarController,
    required this.trainerStudentsController,
    required this.attestationController,
    required this.trialRequestsController,
    required this.apiClient,
    required this.attendanceFactory,
    required this.chatFactory,
  });

  final AuthController authController;
  final MemberHomeController memberHomeController;
  final ScheduleController scheduleController;
  final NewsController newsController;

  /// Мероприятия ребёнка: аттестации и соревнования (#41).
  final SportsController sportsController;
  final ChatsController chatsController;

  /// Нужен истории посещений и предупреждению об отсутствии (H5, H6).
  final AttendanceRepository attendanceRepository;

  final TrainerDayController trainerDayController;
  final TrainerCalendarController trainerCalendarController;
  final TrainerStudentsController trainerStudentsController;

  /// Аттестации: нужны и тренеру (в зале), и руководителю.
  final AttestationController attestationController;

  /// Заявки на пробную: работа администратора.
  final TrialRequestsController trialRequestsController;

  /// Нужен экрану отчётов: сводка запрашивается напрямую.
  final ApiClient apiClient;

  /// Фабрика журналов: у каждого занятия свой журнал, и состояние одного не
  /// должно переходить в другое.
  final AttendanceController Function() attendanceFactory;

  /// Фабрика переписок: у каждого диалога свое состояние.
  final ChatController Function() chatFactory;

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

    // Руководитель: заявки, аттестации, отчёты. Раньше он попадал в тренерский
    // каркас просто потому, что условие было `if MEMBER else Trainer`.
    if (role == 'SUPERADMIN') {
      return AdminShell(
        auth: authController,
        attestations: attestationController,
        trialRequests: trialRequestsController,
        client: apiClient,
      );
    }

    if (role == 'MEMBER') {
      return MemberShell(
        auth: authController,
        home: memberHomeController,
        schedule: scheduleController,
        news: newsController,
        sports: sportsController,
        chats: chatsController,
        attendance: attendanceRepository,
        chatFactory: chatFactory,
      );
    }

    return TrainerShell(
      auth: authController,
      day: trainerDayController,
      calendar: trainerCalendarController,
      students: trainerStudentsController,
      attestations: attestationController,
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
