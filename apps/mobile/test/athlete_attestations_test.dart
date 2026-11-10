import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/app_theme.dart';
import 'package:octagon_mobile/features/owner/owner_athlete_attestations.dart';

/// #150: аттестации в карточке спортсмена.
///
/// Участие, результат и присвоенная ступень — разные факты. Тесты фиксируют,
/// что участие без опубликованного результата не показывается как «сдал»,
/// а пустое состояние не появляется, когда записи есть.
void main() {
  Widget wrap(Widget child) => MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(body: SingleChildScrollView(child: child)),
      );

  AthleteParticipation participation({
    String result = 'PENDING',
    bool published = false,
    String? awarded,
  }) =>
      AthleteParticipation(
        eventId: 'event-1',
        eventTitle: 'Осенняя аттестация 2026',
        scheduledAt: '2026-11-15T10:00:00.000Z',
        targetRankLabel: '3 кю',
        result: result,
        resultsPublished: published,
        awardedRankLabel: awarded,
      );

  testWidgets('нет участий — пустое состояние объясняет причину', (tester) async {
    await tester.pumpWidget(wrap(const AthleteAttestationsSection(
      certifications: [],
      participations: [],
      loading: false,
      error: null,
    )));
    await tester.pumpAndSettle();

    expect(find.textContaining('Аттестаций пока нет'), findsOneWidget);
  });

  testWidgets('назначен, результат не опубликован — «ожидает результата»',
      (tester) async {
    await tester.pumpWidget(wrap(AthleteAttestationsSection(
      certifications: const [],
      participations: [participation()],
      loading: false,
      error: null,
    )));
    await tester.pumpAndSettle();

    expect(find.text('ожидает результата'), findsOneWidget);
    expect(find.textContaining('ступень не присвоена'), findsOneWidget);
    // Не должно быть подписи «сдал».
    expect(find.textContaining('сдал'), findsNothing);
  });

  testWidgets('опубликован PASSED — показывает ступень', (tester) async {
    await tester.pumpWidget(wrap(AthleteAttestationsSection(
      certifications: const [],
      participations: [
        participation(result: 'PASSED', published: true, awarded: '3 кю'),
      ],
      loading: false,
      error: null,
    )));
    await tester.pumpAndSettle();

    expect(find.textContaining('сдал'), findsOneWidget);
    expect(find.textContaining('3 кю'), findsWidgets);
    expect(find.text('ожидает результата'), findsNothing);
  });

  testWidgets('опубликован FAILED — «не сдал»', (tester) async {
    await tester.pumpWidget(wrap(AthleteAttestationsSection(
      certifications: const [],
      participations: [participation(result: 'FAILED', published: true)],
      loading: false,
      error: null,
    )));
    await tester.pumpAndSettle();

    expect(find.text('не сдал'), findsOneWidget);
  });

  testWidgets('несколько присвоений — история целиком', (tester) async {
    await tester.pumpWidget(wrap(const AthleteAttestationsSection(
      certifications: [
        AthleteCertification(
          id: 'c1',
          certifiedOn: '2026-10-29',
          stageLabel: '8 кю',
          beltGrade: 'BLUE',
        ),
        AthleteCertification(
          id: 'c2',
          certifiedOn: '2026-05-12',
          stageLabel: '9 кю',
          beltGrade: 'ORANGE',
        ),
      ],
      participations: [],
      loading: false,
      error: null,
    )));
    await tester.pumpAndSettle();

    expect(find.text('8 кю'), findsOneWidget);
    expect(find.text('9 кю'), findsOneWidget);
    expect(find.text('присвоено'), findsNWidgets(2));
    expect(find.textContaining('синий пояс'), findsOneWidget);
    expect(find.textContaining('Аттестаций пока нет'), findsNothing);
  });

  testWidgets('соревнование без аттестации — пустое состояние, а не ложная запись',
      (tester) async {
    // Соревнования приходят в sportsHistory карточки, сюда не попадают:
    // раздел аттестаций о них молчит.
    await tester.pumpWidget(wrap(const AthleteAttestationsSection(
      certifications: [],
      participations: [],
      loading: false,
      error: null,
    )));
    await tester.pumpAndSettle();

    expect(find.textContaining('соревнован'), findsNothing);
    expect(find.textContaining('Аттестаций пока нет'), findsOneWidget);
  });

  testWidgets('ошибка загрузки не выдаётся за пустую историю', (tester) async {
    await tester.pumpWidget(wrap(const AthleteAttestationsSection(
      certifications: [],
      participations: [],
      loading: false,
      error: 'Не удалось загрузить аттестации',
    )));
    await tester.pumpAndSettle();

    expect(find.text('Не удалось загрузить аттестации'), findsOneWidget);
    expect(find.textContaining('Аттестаций пока нет'), findsNothing);
  });

  test('парсинг участия: результат читается только при публикации', () {
    final published = AthleteParticipation.fromJson(
      {
        'eventId': 'e1',
        'targetRankLabel': '3 кю',
        'result': 'PASSED',
        'resultsPublished': true,
        'awardedRankLabel': '3 кю',
      },
      {'title': 'Осенняя', 'scheduledAt': '2026-11-15T10:00:00.000Z'},
    );
    expect(published.hasPublishedResult, isTrue);

    final draft = AthleteParticipation.fromJson(
      {
        'eventId': 'e1',
        'targetRankLabel': '3 кю',
        'result': 'PASSED',
        'resultsPublished': false,
      },
      {'title': 'Осенняя'},
    );
    // Результат есть в записи, но не опубликован — показывать его нельзя.
    expect(draft.hasPublishedResult, isFalse);
  });

  test('парсинг присвоения: ступень и дата', () {
    final item = AthleteCertification.fromJson({
      'id': 'c1',
      'certifiedOn': '2026-10-29',
      'stageLabel': '8 кю',
      'beltGrade': 'BLUE',
    });
    expect(item.stageLabel, '8 кю');
    expect(item.certifiedOn, '2026-10-29');
    expect(item.beltGrade, 'BLUE');
  });
}
