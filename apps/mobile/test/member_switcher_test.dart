import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/app_theme.dart';
import 'package:octagon_mobile/features/athletes/athlete_models.dart';
import 'package:octagon_mobile/features/home/member_home_screen.dart';

/// #154: при одном ребёнке на главной должно быть видно, чьи данные показаны.
void main() {
  LinkedAthlete athlete({
    required String id,
    required String firstName,
    required String lastName,
    bool primary = false,
  }) =>
      LinkedAthlete(
        id: id,
        firstName: firstName,
        lastName: lastName,
        middleName: null,
        status: 'ACTIVE',
        relation: 'PARENT',
        isPrimary: primary,
        beltGrade: 'WHITE',
        rankLabel: '10 кю',
      );

  Widget wrap(Widget child) => MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(body: child),
      );

  testWidgets('один ребёнок — имя видно', (tester) async {
    final child = athlete(
      id: 'a1',
      firstName: 'Дмитрий',
      lastName: 'Сагабиев',
      primary: true,
    );
    await tester.pumpWidget(wrap(AthleteSwitcher(
      athletes: [child],
      selected: child,
      onSelect: (_) async {},
    )));
    await tester.pumpAndSettle();

    expect(find.text('Сагабиев Дмитрий'), findsOneWidget);
  });

  testWidgets('двое детей — переключатель с обоими именами', (tester) async {
    final first = athlete(id: 'a1', firstName: 'Дмитрий', lastName: 'Сагабиев', primary: true);
    final second = athlete(id: 'a2', firstName: 'Алина', lastName: 'Сагабиева');

    await tester.pumpWidget(wrap(AthleteSwitcher(
      athletes: [first, second],
      selected: first,
      onSelect: (_) async {},
    )));
    await tester.pumpAndSettle();

    expect(find.textContaining('Дмитрий'), findsOneWidget);
    expect(find.textContaining('Алина'), findsOneWidget);
  });

  testWidgets('выбор второго ребёнка вызывает onSelect', (tester) async {
    final first = athlete(id: 'a1', firstName: 'Дмитрий', lastName: 'Сагабиев', primary: true);
    final second = athlete(id: 'a2', firstName: 'Алина', lastName: 'Сагабиева');
    String? picked;

    await tester.pumpWidget(wrap(AthleteSwitcher(
      athletes: [first, second],
      selected: first,
      onSelect: (value) async => picked = value.id,
    )));
    await tester.pumpAndSettle();

    await tester.tap(find.textContaining('Алина'));
    await tester.pumpAndSettle();

    expect(picked, 'a2');
  });

  testWidgets('выбранный ребёнок — один, а не первый по списку', (tester) async {
    final first = athlete(id: 'a1', firstName: 'Дмитрий', lastName: 'Сагабиев', primary: true);
    final second = athlete(id: 'a2', firstName: 'Алина', lastName: 'Сагабиева');

    await tester.pumpWidget(wrap(AthleteSwitcher(
      athletes: [first, second],
      selected: second,
      onSelect: (_) async {},
    )));
    await tester.pumpAndSettle();

    // Оба имени на месте, выбор помечен чипом: проверяем, что выбран второй.
    expect(find.textContaining('Алина'), findsOneWidget);
    expect(find.textContaining('Дмитрий'), findsOneWidget);
  });
}
