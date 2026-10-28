import 'dart:async';

import 'package:flutter/material.dart';

import 'app.dart';
import 'core/api_client.dart';
import 'core/api_config.dart';
import 'core/token_storage.dart';
import 'features/athletes/athlete_repository.dart';
import 'features/admin/trial_requests_screen.dart';
import 'features/attendance/attendance_repository.dart';
import 'features/home/onboarding_repository.dart';
import 'features/attestations/attestation_controller.dart';
import 'features/attestations/attestation_repository.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/auth_repository.dart';
import 'features/chat/chat_controller.dart';
import 'features/chat/chat_repository.dart';
import 'features/chat/chats_controller.dart';
import 'features/groups/group_repository.dart';
import 'features/home/member_home_controller.dart';
import 'features/news/news_controller.dart';
import 'features/news/news_repository.dart';
import 'features/payments/payment_status_repository.dart';
import 'features/sports/sports_controller.dart';
import 'features/sports/sports_repository.dart';
import 'features/schedule/schedule_controller.dart';
import 'features/schedule/schedule_repository.dart';
import 'features/trainer/attendance_controller.dart';
import 'features/trainer/trainer_calendar_controller.dart';
import 'features/trainer/trainer_day_controller.dart';
import 'features/trainer/trainer_repository.dart';
import 'features/trainer/trainer_students_controller.dart';

/// Точка входа приложения.
///
/// Зависимости собираются вручную: граф маленький (клиент, хранилище,
/// репозитории, контроллеры), и подключать DI-контейнер ради десятка объектов
/// означало бы усложнять запуск без выгоды.
void main() {
  WidgetsFlutterBinding.ensureInitialized();

  final config = ApiConfig.fromEnvironment();
  final client = HttpApiClient(config: config);

  // Обложки новостей (#70) лежат вне /api/v1: базой служит тот же хост без префикса.
  final mediaBase = config.baseUrl.replaceAll('/api/v1', '');

  final authController = AuthController(
    repository: AuthRepository(
      client: client,
      storage: SecureTokenStorage(),
    ),
  );

  // Посещаемость нужна и главной (сводка), и истории с предупреждением об
  // отсутствии: репозиторий один, запросы разные.
  final attendanceRepository = AttendanceRepository(client: client);

  // Привязка ребёнка (ADR-0015): родитель вводит код или оставляет заявку.
  final onboardingRepository = OnboardingRepository(client: client);

  final memberHomeController = MemberHomeController(
    athletes: AthleteRepository(client: client),
    groups: GroupRepository(client: client),
    schedule: ScheduleRepository(client: client),
    attendance: attendanceRepository,
    news: NewsRepository(client: client, mediaBase: mediaBase),
    payments: PaymentStatusRepository(client: client),
  );

  final scheduleController = ScheduleController(
    repository: ScheduleRepository(client: client),
  );

  final newsController = NewsController(
    repository: NewsRepository(client: client, mediaBase: mediaBase),
  );

  // Мероприятия ребёнка (#41): один запрос отдаёт аттестации и соревнования
  // своих спортсменов, уже отфильтрованные по правам и публикации.
  // Аттестации и заявки: нужны тренеру в зале и руководителю на телефоне.
  final attestationController = AttestationController(
    repository: ApiAttestationRepository(client: client),
  );
  final trialRequestsController = TrialRequestsController(
    repository: TrialRequestsRepository(client: client),
  );

  final sportsController = SportsController(
    repository: ApiSportsRepository(client: client),
  );

  // Тренерские контроллеры: репозиторий общий, состояние — раздельное.
  final trainerRepository = TrainerRepository(client: client);
  final trainerDayController = TrainerDayController(repository: trainerRepository);
  final trainerCalendarController = TrainerCalendarController(repository: trainerRepository);
  final trainerStudentsController = TrainerStudentsController(repository: trainerRepository);

  // Чаты: репозиторий общий, состояние списка и переписок — раздельное.
  final chatRepository = ChatRepository(client: client);
  final chatsController = ChatsController(repository: chatRepository);

  // Проверка сессии запускается до показа интерфейса: иначе у уже вошедшего
  // человека на мгновение мелькал бы экран входа.
  unawaited(authController.restore());

  runApp(
    OctagonApp(
      authController: authController,
      memberHomeController: memberHomeController,
      scheduleController: scheduleController,
      newsController: newsController,
      sportsController: sportsController,
      chatsController: chatsController,
      attendanceRepository: attendanceRepository,
    onboardingRepository: onboardingRepository,
      trainerDayController: trainerDayController,
      trainerCalendarController: trainerCalendarController,
      trainerStudentsController: trainerStudentsController,
      attestationController: attestationController,
      trialRequestsController: trialRequestsController,
      apiClient: client,
      attendanceFactory: () => AttendanceController(repository: trainerRepository),
      chatFactory: () => ChatController(repository: chatRepository),
    ),
  );
}
