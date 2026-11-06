import 'package:flutter/foundation.dart';

import 'api_client.dart';

/// Время клуба.
///
/// API отдаёт `startsAt` в UTC, а телефон может стоять в любом поясе: у
/// владельца в Новосибирске (UTC+7) занятие 13:00Z показывалось как 20:00,
/// хотя в зале оно идёт в 18:00 по времени клуба (Алматы, UTC+5).
///
/// Часовой пояс клуба приходит в `/health` (`clubTimezone`). Смещение
/// кешируется на время сессии; пока ответа нет — используется UTC+5,
/// фактический пояс клуба, чтобы не показывать неверное время.
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

  @visibleForTesting
  static void setTimeZoneForTest(String zone) {
    _timeZone = zone;
    _offsetHours = _offsets[zone] ?? 5;
    _loaded = true;
  }
}
