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

/// #161: композер чата должен быть виден и над системной навигацией,
/// и над экранной клавиатурой.
///
/// Первый заход (PR #162) проверял только наличие `SafeArea` и что композер
/// влезает в экран. На реальном Android клавиатура перекрывала ввод, поэтому
/// теперь тест измеряет **фактические прямоугольники** поля ввода и кнопки
/// отправки относительно зоны IME и системной панели.
void main() {
  const screen = Size(390, 844);

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

  Future<Widget> buildChat() async => ChatScreen(
        auth: buildAuth(),
        controller: buildController(),
        title: 'Чат',
      );

  Future<({Rect field, Rect send, double imeTop, double navTop})> pumpChat(
    WidgetTester tester, {
    required double bottomPadding,
    required double keyboardInset,
  }) async {
    await tester.binding.setSurfaceSize(screen);
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      MediaQuery(
        data: MediaQueryData(
          size: screen,
          padding: EdgeInsets.only(bottom: bottomPadding),
          viewPadding: EdgeInsets.only(bottom: bottomPadding),
          viewInsets: EdgeInsets.only(bottom: keyboardInset),
        ),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: await buildChat(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final field = find.byType(TextField);
    final send = find.byIcon(Icons.send);
    expect(field, findsOneWidget, reason: 'поле ввода должно быть на экране');
    expect(send, findsOneWidget, reason: 'кнопка отправки должна быть на экране');

    return (
      field: tester.getRect(field),
      send: tester.getRect(send),
      imeTop: screen.height - keyboardInset,
      navTop: screen.height - bottomPadding,
    );
  }

  testWidgets('клавиатура открыта — поле и кнопка целиком над клавиатурой',
      (tester) async {
    final result = await pumpChat(tester, bottomPadding: 0, keyboardInset: 300);

    expect(result.imeTop, 544);
    expect(result.field.bottom, lessThanOrEqualTo(result.imeTop),
        reason: 'поле ввода не должно уходить под клавиатуру');
    expect(result.send.bottom, lessThanOrEqualTo(result.imeTop),
        reason: 'кнопка отправки не должна уходить под клавиатуру');
    expect(result.field.top, greaterThan(0));
  });

  testWidgets('клавиатура открыта поверх трёхкнопочной навигации',
      (tester) async {
    final result = await pumpChat(tester, bottomPadding: 48, keyboardInset: 280);

    expect(result.field.bottom, lessThanOrEqualTo(result.imeTop));
    expect(result.send.bottom, lessThanOrEqualTo(result.imeTop));
  });

  testWidgets('без клавиатуры поле над системной навигацией', (tester) async {
    final result = await pumpChat(tester, bottomPadding: 48, keyboardInset: 0);

    expect(result.navTop, 796);
    expect(result.field.bottom, lessThanOrEqualTo(result.navTop),
        reason: 'поле не должно уходить под трёхкнопочную панель');
    expect(result.send.bottom, lessThanOrEqualTo(result.navTop));
  });

  testWidgets('gesture navigation — без лишней пустой полосы', (tester) async {
    final result = await pumpChat(tester, bottomPadding: 0, keyboardInset: 0);

    expect(result.field.bottom, greaterThan(screen.height - 60));
    expect(result.field.bottom, lessThanOrEqualTo(screen.height));
  });

  testWidgets('многострочный текст не уводит поле под клавиатуру', (tester) async {
    await tester.binding.setSurfaceSize(screen);
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(
          size: screen,
          viewInsets: EdgeInsets.only(bottom: 300),
        ),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: await buildChat(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final field = find.byType(TextField);
    await tester.enterText(
      field,
      'Длинное сообщение в несколько строк, чтобы проверить рост поля',
    );
    await tester.pumpAndSettle();

    final rect = tester.getRect(field);
    expect(rect.bottom, lessThanOrEqualTo(screen.height - 300));
    expect(rect.height, greaterThan(0));
  });
}
