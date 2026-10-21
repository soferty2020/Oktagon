import 'package:flutter/material.dart';

/// Дизайн-токены приложения (по макету клуба).
///
/// Цвета, радиусы и отступы собраны в одном месте, а не задаются в каждом
/// виджете: иначе следующая правка макета превращается в поиск по всем экранам,
/// и обязательно что-то остается со старым оттенком.
///
/// Значения сняты с макета: акцент — насыщенный оранжевый, фон белый, тёмные
/// элементы почти чёрные, вторичный текст — серый.
class AppColors {
  const AppColors._();

  /// Основной акцент: кнопки, активная вкладка, важные карточки.
  static const Color accent = Color(0xFFFF6B00);

  /// Затемнение акцента для нажатого состояния.
  static const Color accentDark = Color(0xFFE05F00);

  /// Мягкая подложка акцента: чипы, выделенные строки.
  static const Color accentSoft = Color(0xFFFFF0E5);

  /// Фон экранов.
  static const Color background = Color(0xFFFFFFFF);

  /// Фон второстепенных блоков и полей поиска.
  static const Color surfaceMuted = Color(0xFFF4F4F6);

  /// Тёмные поверхности: шапка тренера, сайдбар админки.
  static const Color dark = Color(0xFF0E0E10);

  /// Основной текст.
  static const Color textPrimary = Color(0xFF111114);

  /// Второстепенный текст: подписи, даты.
  static const Color textSecondary = Color(0xFF8A8A8F);

  /// Текст на белом фоне в третичных подписях (например, «Все»).
  static const Color textTertiary = Color(0xFFA9A9AE);

  /// Ошибки и отсутствие.
  static const Color danger = Color(0xFFE23B3B);

  /// Подтвержденное присутствие.
  static const Color success = Color(0xFF2E9E5B);

  /// Ожидание: предупреждения и незавершенные действия.
  static const Color warning = Color(0xFFFFA726);

  /// Разделитель: тонкая линия между строками.
  static const Color divider = Color(0xFFEDEDF0);
}

/// Отступы. Шаг 4: значения кратны, чтобы экраны не «плыли» друг относительно
/// друга.
class AppSpacing {
  const AppSpacing._();

  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
}

/// Радиусы скруглений по макету.
class AppRadius {
  const AppRadius._();

  /// Карточки и крупные блоки.
  static const double card = 18;

  /// Кнопки и поля ввода.
  static const double control = 14;

  /// Чипы и небольшие плашки.
  static const double chip = 10;

  /// Круглые элементы (аватары).
  static const double pill = 999;
}

/// Тени. В макете они почти незаметны: карточки отделяются фоном, а не тенью.
/// Намеренно мягкая тень, чтобы не спорить с макетом.
class AppShadows {
  const AppShadows._();

  static const List<BoxShadow> card = [
    BoxShadow(
      color: Color(0x0A000000),
      blurRadius: 16,
      offset: Offset(0, 4),
    ),
  ];
}
