import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:octagon_mobile/app_theme.dart';
import 'package:octagon_mobile/core/api_client.dart';
import 'package:octagon_mobile/core/api_config.dart';
import 'package:octagon_mobile/features/attestations/attestation_controller.dart';
import 'package:octagon_mobile/features/attestations/attestation_repository.dart';
import 'package:octagon_mobile/features/admin/trial_requests_screen.dart';
import 'package:octagon_mobile/features/auth/auth_controller.dart';
import 'package:octagon_mobile/features/auth/auth_repository.dart';
import 'package:octagon_mobile/features/chat/chat_controller.dart';
import 'package:octagon_mobile/features/chat/chat_repository.dart';
import 'package:octagon_mobile/features/chat/chats_controller.dart';
import 'package:octagon_mobile/features/news/news_controller.dart';
import 'package:octagon_mobile/features/news/news_repository.dart';
import 'package:octagon_mobile/features/owner/owner_shell.dart';
import 'package:octagon_mobile/core/token_storage.dart';

/// Скриншоты экранов владельца на реальном Android.
///
/// Вход выполняется через контроллер (эмуляторный ввод текста в Flutter-поля
/// через adb не работает: uiautomator не видит поля Canvas). Дальше снимаются
/// настоящие экраны приложения на устройстве.
///
/// Запуск:
///   flutter test integration_test/owner_screens_test.dart -d emulator-5554
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('скриншоты владельца на устройстве', (tester) async {
    const config = ApiConfig(baseUrl: 'https://api.octagon-karate.online/api/v1');
    final client = HttpApiClient(config: config);

    final auth = AuthController(
      repository: AuthRepository(client: client, storage: SecureTokenStorage()),
    );
    await auth.login(
      email: 'o.sagabiev@gmail.com',
      password: 'ft3zy46iI-Octagon',
    );

    expect(auth.user, isNotNull);

    final attestations = AttestationController(
      repository: ApiAttestationRepository(client: client),
    );
    final news = NewsController(repository: NewsRepository(client: client));
    final chats = ChatsController(repository: ChatRepository(client: client));
    final trials = TrialRequestsController(
      repository: TrialRequestsRepository(client: client),
    );

    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        home: OwnerShell(
          auth: auth,
          attestations: attestations,
          trialRequests: trials,
          news: news,
          chats: chats,
          chatFactory: () => ChatController(repository: ChatRepository(client: client)),
          client: client,
        ),
      ),
    );
    await tester.pumpAndSettle(const Duration(seconds: 5));

    await binding.takeScreenshot('owner-overview');
    debugPrint('  снят обзор');

    // Раздел «Спортсмены».
    await tester.tap(find.text('Спортсмены').last);
    await tester.pumpAndSettle(const Duration(seconds: 4));
    await binding.takeScreenshot('owner-athletes');

    // Раздел «Расписание».
    await tester.tap(find.text('Расписание').last);
    await tester.pumpAndSettle(const Duration(seconds: 4));
    await binding.takeScreenshot('owner-schedule');

    // Раздел «Финансы».
    await tester.tap(find.text('Финансы').last);
    await tester.pumpAndSettle(const Duration(seconds: 4));
    await binding.takeScreenshot('owner-finance');

    // Раздел «Ещё».
    await tester.tap(find.text('Ещё').last);
    await tester.pumpAndSettle(const Duration(seconds: 3));
    await binding.takeScreenshot('owner-more');

    debugPrint('  скриншоты готовы');
  });
}
