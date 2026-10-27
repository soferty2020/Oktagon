import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/app_theme.dart';
import 'package:octagon_mobile/features/auth/auth_controller.dart';
import 'package:octagon_mobile/features/auth/auth_repository.dart';
import 'package:octagon_mobile/features/auth/login_screen.dart';

import 'support/fake_api_client.dart';
import 'support/in_memory_token_storage.dart';

void main() {
  testWidgets('на узком экране поля входа не выходят за границы', (tester) async {
    // Проверка вёрстки, которую скриншот показывает, но не измеряет: на телефоне
    // шириной 390 поле, вылезающее за край, означает обрезанную форму.
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final controller = AuthController(
      repository: AuthRepository(
        client: FakeApiClient(),
        storage: InMemoryTokenStorage(),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: LoginScreen(controller: controller),
      ),
    );
    await tester.pumpAndSettle();

    final fields = find.byType(TextFormField);
    expect(fields, findsNWidgets(2));

    for (final element in fields.evaluate()) {
      final rect = tester.getRect(find.byWidget(element.widget));
      expect(
        rect.left,
        greaterThanOrEqualTo(0),
        reason: 'поле начинается за левым краем: ${rect.left}',
      );
      expect(
        rect.right,
        lessThanOrEqualTo(390),
        reason: 'поле выходит за правый край: ${rect.right}',
      );
    }

    // Кнопка должна быть в тех же границах, что и поля.
    // На экране теперь две FilledButton: «Войти» и «Зарегистрироваться»
    // (ADR-0015), поэтому ищем именно кнопку входа.
    final button = tester.getRect(find.widgetWithText(FilledButton, 'Войти'));
    expect(button.left, greaterThanOrEqualTo(0));
    expect(button.right, lessThanOrEqualTo(390));
  });
}
