import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/core/club_clock.dart';

/// Календарные интервалы клуба.
///
/// Сервер сравнивает `startsAt >= from AND startsAt < to`: одинаковые from/to
/// для одного дня не находили ничего, отсюда «5 зан.» в месяце и «занятий нет»
/// внутри дня. Тесты фиксируют полуоткрытые интервалы и границы.
void main() {
  setUp(() {
    ClubClock.setTimeZoneForTest('Asia/Almaty');
  });

  group('интервалы', () {
    test('день — от начала суток до начала следующих', () {
      final range = ClubClock.dayRange(DateTime(2026, 11, 7));
      expect(range.from, '2026-11-07T00:00:00+05:00');
      expect(range.to, '2026-11-08T00:00:00+05:00');
      expect(range.from, isNot(range.to));
    });

    test('неделя — от понедельника до следующего понедельника', () {
      // 7 ноября 2026 — суббота.
      final range = ClubClock.weekRange(DateTime(2026, 11, 7));
      expect(range.from, '2026-11-02T00:00:00+05:00');
      expect(range.to, '2026-11-09T00:00:00+05:00');
    });

    test('месяц — от первого числа до первого числа следующего', () {
      final range = ClubClock.monthRange(DateTime(2026, 11, 7));
      expect(range.from, '2026-11-01T00:00:00+05:00');
      expect(range.to, '2026-12-01T00:00:00+05:00');
    });

    test('последний день месяца не исключается', () {
      final range = ClubClock.monthRange(DateTime(2026, 11, 30));
      final lastDay = DateTime.parse('2026-11-30T20:00:00+05:00').toUtc();
      final from = DateTime.parse(range.from).toUtc();
      final to = DateTime.parse(range.to).toUtc();
      expect(lastDay.isAfter(from), isTrue);
      expect(lastDay.isBefore(to), isTrue);
    });

    test('последний день недели не исключается', () {
      // Воскресенье 8 ноября входит в неделю 2–8 ноября.
      final range = ClubClock.weekRange(DateTime(2026, 11, 8));
      final sunday = DateTime.parse('2026-11-08T23:00:00+05:00').toUtc();
      expect(sunday.isBefore(DateTime.parse(range.to).toUtc()), isTrue);
    });

    test('переход через полночь: 23:59 входит в свой день, 00:01 — в следующий', () {
      final day7 = ClubClock.dayRange(DateTime(2026, 11, 7));
      final late = DateTime.parse('2026-11-07T23:59:00+05:00').toUtc();
      final next = DateTime.parse('2026-11-08T00:01:00+05:00').toUtc();
      expect(late.isBefore(DateTime.parse(day7.to).toUtc()), isTrue);

      final day8 = ClubClock.dayRange(DateTime(2026, 11, 8));
      expect(next.isAfter(DateTime.parse(day8.from).toUtc()), isTrue);
    });

    test('конец года: 31 декабря и 1 января', () {
      final december = ClubClock.monthRange(DateTime(2026, 12, 31));
      expect(december.from, '2026-12-01T00:00:00+05:00');
      expect(december.to, '2027-01-01T00:00:00+05:00');

      final january = ClubClock.dayRange(DateTime(2027, 1, 1));
      expect(january.from, '2027-01-01T00:00:00+05:00');
      expect(january.to, '2027-01-02T00:00:00+05:00');
    });

    test('7 ноября внутри месяца и внутри своей недели', () {
      final month = ClubClock.monthRange(DateTime(2026, 11, 7));
      final day = ClubClock.dayRange(DateTime(2026, 11, 7));
      final dayStart = DateTime.parse(day.from).toUtc();
      expect(dayStart.isAfter(DateTime.parse(month.from).toUtc()), isTrue);
      expect(dayStart.isBefore(DateTime.parse(month.to).toUtc()), isTrue);
    });
  });

  group('часовой пояс', () {
    test('время занятия считается по поясу клуба, а не телефона', () {
      // 13:00Z = 18:00 в Алматы (UTC+5).
      expect(ClubClock.formatTime('2026-11-07T13:00:00.000Z'), '18:00');
    });

    test('смена пояса клуба меняет время', () {
      ClubClock.setTimeZoneForTest('Asia/Novosibirsk');
      expect(ClubClock.formatTime('2026-11-07T13:00:00.000Z'), '20:00');
      ClubClock.setTimeZoneForTest('Asia/Almaty');
      expect(ClubClock.formatTime('2026-11-07T13:00:00.000Z'), '18:00');
    });

    test('«сегодня» клуба — календарный день, а не UTC', () {
      final today = ClubClock.todayInClub();
      final nowClub = ClubClock.nowInClub();
      expect(today.year, nowClub.year);
      expect(today.month, nowClub.month);
      expect(today.day, nowClub.day);
      expect(today.hour, 0);
    });
  });

  group('локализация', () {
    testWidgets('DatePicker говорит по-русски', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('ru', 'RU'),
          supportedLocales: const [Locale('ru', 'RU')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: Builder(
            builder: (context) {
              return TextButton(
                onPressed: () => showDatePicker(
                  context: context,
                  initialDate: DateTime(2026, 11, 5),
                  firstDate: DateTime(2020),
                  lastDate: DateTime(2035),
                ),
                child: const Text('open'),
              );
            },
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      // Русский MaterialLocalizations: подписи кнопок и месяцев.
      final localizations = MaterialLocalizations.of(
        tester.element(find.byType(Dialog).first),
      );
      expect(localizations.cancelButtonLabel, isNot('Cancel'));
      expect(localizations.cancelButtonLabel.toLowerCase(), contains('мен'));
      expect(
        localizations.formatMonthYear(DateTime(2026, 11)).toLowerCase(),
        contains('ноябр'),
      );
    });
  });
}
