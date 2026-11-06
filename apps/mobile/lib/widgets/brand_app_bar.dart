import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// Общая шапка мобильного интерфейса владельца.
///
/// Логотип — оригинальный файл из брендовых материалов (`octagon-logo.png`,
/// 1100×307, прозрачный фон). Рисуется через [Image.asset], поэтому не зависит
/// от системного шрифта и одинаково выглядит на любой плотности экрана.
///
/// Высота шапки фиксирована (52), логотип масштабируется по высоте и
/// ограничен по ширине: на 360 px он не обрезается и не прижимается к краю.
class BrandAppBar extends StatelessWidget implements PreferredSizeWidget {
  const BrandAppBar({super.key, this.actions});

  /// Действия справа (например, обновить). Логотип слева.
  final List<Widget>? actions;

  /// Высота шапки. 52 — как в макете; системный status bar платформа
  /// добавляет сама, поэтому SafeArea не нужен.
  static const double height = 52;

  @override
  Size get preferredSize => const Size.fromHeight(height);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      backgroundColor: AppColors.dark,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      automaticallyImplyLeading: false,
      titleSpacing: 16,
      title: LayoutBuilder(
        builder: (context, constraints) {
          // Логотип занимает не больше 45% ширины шапки: справа должны
          // поместиться действия, а на узких экранах логотип не обрежется.
          final maxWidth = constraints.maxWidth * 0.45;
          return Align(
            alignment: Alignment.centerLeft,
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: maxWidth, maxHeight: 26),
              child: Image.asset(
                'assets/brand/octagon-logo.png',
                fit: BoxFit.contain,
                alignment: Alignment.centerLeft,
                filterQuality: FilterQuality.high,
                errorBuilder: (context, error, stackTrace) => const Text(
                  'OCTAGON',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
              ),
            ),
          );
        },
      ),
      actions: actions,
    );
  }
}
