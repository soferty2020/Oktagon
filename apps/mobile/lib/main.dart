import 'dart:async';

import 'package:flutter/material.dart';

import 'app.dart';
import 'core/api_client.dart';
import 'core/api_config.dart';
import 'core/token_storage.dart';
import 'features/athletes/athlete_repository.dart';
import 'features/attendance/attendance_repository.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/auth_repository.dart';
import 'features/groups/group_repository.dart';
import 'features/home/member_home_controller.dart';
import 'features/news/news_controller.dart';
import 'features/news/news_repository.dart';
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

  final authController = AuthController(
    repository: AuthRepository(
      client: client,
      storage: SecureTokenStorage(),
    ),
  );

  final memberHomeController = MemberHomeController(
    athletes: AthleteRepository(client: client),
    groups: GroupRepository(client: client),
    schedule: ScheduleRepository(client: client),
    attendance: AttendanceRepository(client: client),
    news: NewsRepository(client: client),
  );

  final scheduleController = ScheduleController(
    repository: ScheduleRepository(client: client),
  );

  final newsController = NewsController(repository: NewsRepository(client: client));

  // Тренерские контроллеры: репозиторий общий, состояние — раздельное.
  final trainerRepository = TrainerRepository(client: client);
  final trainerDayController = TrainerDayController(repository: trainerRepository);
  final trainerCalendarController = TrainerCalendarController(repository: trainerRepository);
  final trainerStudentsController = TrainerStudentsController(repository: trainerRepository);

  // Проверка сессии запускается до показа интерфейса: иначе у уже вошедшего
  // человека на мгновение мелькал бы экран входа.
  unawaited(authController.restore());

  runApp(
    OctagonApp(
      authController: authController,
      memberHomeController: memberHomeController,
      scheduleController: scheduleController,
      newsController: newsController,
      trainerDayController: trainerDayController,
      trainerCalendarController: trainerCalendarController,
      trainerStudentsController: trainerStudentsController,
      attendanceFactory: () => AttendanceController(repository: trainerRepository),
    ),
  );
}
