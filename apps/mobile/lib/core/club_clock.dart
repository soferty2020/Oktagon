import 'package:flutter/foundation.dart';

import 'api_client.dart';

/// Время и календарь клуба.
///
/// API отдаёт `startsAt` в UTC, а `/training-sessions` принимает `from`/`to`
/// как ISO-8601, причём `to` — **исключительно** (`startsAt < to`). Поэтому
/// клиент обязан передавать полуоткрытые интервалы, построенные в часовом
/// поясе клуба, а не в поясе телефона:
///
/// - день: `00:00` выбранной даты → `00:00` следующей;
/// - неделя: `00:00` понедельника → `00:00` следующего понедельника;
/// - месяц: `00:00` первого числа → `00:00` первого числа следующего месяца.
///
/// Раньше для одного дня отправлялись одинаковые `from` и `to`, и сервер
/// возвращал пустой список: `startsAt >= from AND startsAt < to` при `from == to`
/// не выполняется никогда. Отсюда «5 зан.» в календаре и «занятий нет» в дне.
class ClubClock {
  ClubClock._();

  /// Смещение в часах. Алматы не переходит на летнее время, поэтому
  /// фиксированного значения достаточно; для других зон карта расширяется.
  static const Map<String, int> _offsets = {
    'Asia/Almaty': 5,
    'Asia/Novosibirsk': 7,
    'Asia/Aqtobe': 5,
    'Asia/Astana': 5,
    'UTC': 0,
  };

  static int _offsetHours = 5;
  static String _timeZone = 'Asia/Almaty';
  static bool _loaded = false;

  static String get timeZone => _timeZone;
  static int get offsetHours => _offsetHours;

  /// Загружает часовой пояс клуба из `/health`. Ошибка сети не критична:
  /// остаётся значение по умолчанию.
  static Future<void> load(ApiClient client) async {
    if (_loaded) {
      return;
    }
    _loaded = true;
    try {
      final response = await client.getJson('/health');
      final zone = response['clubTimezone'] as String?;
      if (zone != null && _offsets.containsKey(zone)) {
        _timeZone = zone;
        _offsetHours = _offsets[zone]!;
      }
    } catch (error) {
      debugPrint('ClubClock: пояс клуба не получен, используется $_timeZone');
    }
  }

  /// «Сейчас» по часам клуба (наивное локальное время без пояса).
  static DateTime nowInClub() =>
      DateTime.now().toUtc().add(Duration(hours: _offsetHours));

  /// Календарная дата «сегодня» по часам клуба.
  static DateTime todayInClub() {
    final now = nowInClub();
    return DateTime(now.year, now.month, now.day);
  }

  /// Время по часам клуба.
  static DateTime fromUtc(String iso) {
    final parsed = DateTime.tryParse(iso);
    if (parsed == null) {
      return DateTime.now();
    }
    return parsed.toUtc().add(Duration(hours: _offsetHours));
  }

  /// `ЧЧ:ММ` по часам клуба.
  static String formatTime(String? iso) {
    if (iso == null) {
      return '—';
    }
    final local = fromUtc(iso);
    return '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
  }

  /// `д Месяц` по часам клуба.
  static String formatDate(String? iso) {
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];
    if (iso == null) {
      return '—';
    }
    final local = fromUtc(iso);
    return '${local.day} ${months[local.month - 1]}';
  }

  /// `дд.мм.гггг` по часам клуба.
  static String formatShortDate(String? iso) {
    if (iso == null) {
      return '—';
    }
    final local = fromUtc(iso);
    return '${local.day.toString().padLeft(2, '0')}.'
        '${local.month.toString().padLeft(2, '0')}.${local.year}';
  }

  /// Начало суток клуба в ISO-8601 UTC: `2026-11-06T19:00:00.000Z`.
  ///
  /// Возвращается UTC, а не смещение `+05:00`: в query-строке знак `+`
  /// декодируется как пробел, и сервер отвечал `VALIDATION_FAILED`, если
  /// значение не закодировано. UTC-форма не требует кодирования и означает
  /// тот же момент времени.
  static String isoAtClubMidnight(DateTime clubDate) {
    final local = DateTime.utc(clubDate.year, clubDate.month, clubDate.day);
    // Полночь клуба в UTC: для Алматы 00:00 превращается в 19:00 предыдущего дня.
    return local.subtract(Duration(hours: _offsetHours)).toIso8601String();
  }

  /// Интервал одного дня: `[00:00 даты, 00:00 следующего дня)`.
  static ({String from, String to}) dayRange(DateTime date) {
    final start = DateTime(date.year, date.month, date.day);
    final end = DateTime(date.year, date.month, date.day + 1);
    return (from: isoAtClubMidnight(start), to: isoAtClubMidnight(end));
  }

  /// Интервал недели: `[00:00 понедельника, 00:00 следующего понедельника)`.
  static ({String from, String to}) weekRange(DateTime date) {
    final monday = DateTime(date.year, date.month, date.day)
        .subtract(Duration(days: date.weekday - 1));
    final nextMonday = DateTime(monday.year, monday.month, monday.day + 7);
    return (from: isoAtClubMidnight(monday), to: isoAtClubMidnight(nextMonday));
  }

  /// Интервал месяца: `[00:00 первого числа, 00:00 первого числа следующего)`.
  static ({String from, String to}) monthRange(DateTime date) {
    final start = DateTime(date.year, date.month, 1);
    final end = DateTime(date.year, date.month + 1, 1);
    return (from: isoAtClubMidnight(start), to: isoAtClubMidnight(end));
  }

  @visibleForTesting
  static void setTimeZoneForTest(String zone) {
    _timeZone = zone;
    _offsetHours = _offsets[zone] ?? 5;
    _loaded = true;
  }
}
