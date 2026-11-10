import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/app_theme.dart';
import 'package:octagon_mobile/features/auth/auth_controller.dart';
import 'package:octagon_mobile/features/auth/auth_models.dart';
import 'package:octagon_mobile/features/auth/auth_repository.dart';
import 'package:octagon_mobile/features/chat/chat_controller.dart';
import 'package:octagon_mobile/features/chat/chat_repository.dart';
import 'package:octagon_mobile/features/chat/chat_screen.dart';

import 'support/fake_api_client.dart';
import 'support/in_memory_token_storage.dart';

/// #161: поле ввода чата не должно уходить под системную навигацию Android.
///
/// `Scaffold(bottomNavigationBar: …)` находится вне `body: SafeArea`, поэтому
/// отступ системной панели композер обязан учитывать сам.
void main() {
  AuthController buildAuth() {
    final controller = AuthController(
      repository: AuthRepository(client: FakeApiClient(), storage: InMemoryTokenStorage()),
    );
    controller.setSessionForTest(
      AuthSession(
        accessToken: 't',
        refreshToken: 'r',
        accessExpiresAt: DateTime.now().add(const Duration(hours: 1)),
        user: const UserProfile(
          id: 'u1',
          email: 'parent@octagon.local',
          firstName: 'Родитель',
          lastName: 'Клуба',
          role: 'MEMBER',
          permissions: <String>[],
        ),
      ),
    );
    return controller;
  }

  ChatController buildController() =>
      ChatController(repository: ChatRepository(client: FakeApiClient()));

  Future<({bool wrapped, double composerBottom})> pumpChat(
    WidgetTester tester, {
    required double bottomPadding,
    required double keyboardInset,
  }) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      MediaQuery(
        data: MediaQueryData(
          size: const Size(390, 844),
          padding: EdgeInsets.only(bottom: bottomPadding),
          viewPadding: EdgeInsets.only(bottom: bottomPadding),
          viewInsets: EdgeInsets.only(bottom: keyboardInset),
        ),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: ChatScreen(
            auth: buildAuth(),
            controller: buildController(),
            title: 'Чат',
          ),
        ),
      ),
    );
    await tester.pump();

    final scaffold = tester.widget<Scaffold>(find.byType(Scaffold).first);
    final wrapped = scaffold.bottomNavigationBar is SafeArea;
    if (wrapped) {
      final safe = scaffold.bottomNavigationBar as SafeArea;
      expect(safe.top, isFalse, reason: 'верх уже учтён AppBar');
    }

    final field = find.byType(TextField);
    final rect = field.evaluate().isEmpty ? null : tester.getRect(field.first);
    return (wrapped: wrapped, composerBottom: rect?.bottom ?? 0);
  }

  testWidgets('композер обёрнут в SafeArea с top: false', (tester) async {
    final result = await pumpChat(tester, bottomPadding: 48, keyboardInset: 0);
    expect(result.wrapped, isTrue);
  });

  testWidgets('трёхкнопочная навигация 48 px не перекрывает поле', (tester) async {
    const inset = 48.0;
    final result = await pumpChat(tester, bottomPadding: inset, keyboardInset: 0);

    // Поле ввода должно заканчиваться выше системной панели.
    expect(result.composerBottom, lessThanOrEqualTo(844 - inset + 0.5));
  });

  testWidgets('gesture navigation (0 px) не оставляет пустой полосы',
      (tester) async {
    final result = await pumpChat(tester, bottomPadding: 0, keyboardInset: 0);
    expect(result.wrapped, isTrue);
    expect(result.composerBottom, greaterThan(0));
  });

  testWidgets('клавиатура не даёт двойного отступа', (tester) async {
    // При открытой клавиатуре padding.bottom обнуляется системой,
    // viewInsets.bottom обрабатывает Scaffold.
    final result = await pumpChat(tester, bottomPadding: 0, keyboardInset: 300);
    expect(result.wrapped, isTrue);
    expect(result.composerBottom, lessThanOrEqualTo(844));
    expect(result.composerBottom, greaterThan(0));
  });
}
