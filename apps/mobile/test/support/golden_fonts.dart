import 'dart:io';

import 'package:flutter/services.dart';

/// Загрузка шрифтов для golden-скриншотов.
///
/// Без этого Flutter в тестах рисует текст прямоугольниками (тестовый шрифт Ahem),
/// а иконки — квадратами, и скриншот не показывает реальный интерфейс. Один
/// helper на все файлы: иначе легко получить читаемый текст в одном файле и
/// прямоугольники в другом.
Future<void> loadGoldenFonts() async {
  final textFonts = [
    'C:/Windows/Fonts/segoeui.ttf',
    'C:/Windows/Fonts/arial.ttf',
  ];

  for (final path in textFonts) {
    final file = File(path);
    if (!file.existsSync()) {
      continue;
    }
    await _load(file, 'Roboto');
    break;
  }

  final iconFont = File(
    '../../.tools/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
  );
  if (iconFont.existsSync()) {
    await _load(iconFont, 'MaterialIcons');
  }
}

Future<void> _load(File file, String family) async {
  // Копия байтов через Uint8List.fromList: у прочитанных байтов ненулевой offset,
  // и FontLoader такой шрифт молча не применяет.
  final bytes = Uint8List.fromList(file.readAsBytesSync());
  final loader = FontLoader(family)..addFont(Future.value(ByteData.view(bytes.buffer)));
  await loader.load();
}
