/// Названия поясов для мобильного приложения (K3).
///
/// Дублирует `BELT_GRADES` из `packages/contracts/src/belt-grades.ts`: справочник
/// фиксирован и меняется только вместе с кодом, но подписи нужны без запроса к
/// API. При изменении набора обновляются оба места — это осознанная плата за
/// отсутствие сетевого вызова на каждый экран.
library;

/// Подписи по кодам; порядок совпадает со ступенями.
const Map<String, String> beltLabels = {
  'WHITE': 'Белый',
  'ORANGE': 'Оранжевый',
  'ORANGE_BLUE_STRIPE': 'Оранжевый с синей полоской',
  'BLUE': 'Синий',
  'BLUE_YELLOW_STRIPE': 'Синий с жёлтой полоской',
  'YELLOW': 'Жёлтый',
  'YELLOW_GREEN_STRIPE': 'Жёлтый с зелёной полоской',
  'GREEN': 'Зелёный',
  'GREEN_BROWN_STRIPE': 'Зелёный с коричневой полоской',
  'BROWN': 'Коричневый',
  'BROWN_GOLD_STRIPE': 'Коричневый с золотой полоской',
  'BLACK': 'Чёрный',
};

/// Подпись пояса; `null`, если пояс не присвоен или код неизвестен.
String? beltLabel(String? code) {
  if (code == null || code.isEmpty) {
    return null;
  }
  return beltLabels[code];
}

/// Строка для интерфейса: «Жёлтый пояс, с 10.02.2024».
///
/// Дата необязательна: у старых карточек пояс мог быть заведен без неё.
String? beltDescription(String? code, String? awardedAt) {
  final label = beltLabel(code);
  if (label == null) {
    return null;
  }

  final formatted = _formatDate(awardedAt);
  return formatted == null ? '$label пояс' : '$label пояс, с $formatted';
}

/// `YYYY-MM-DD` → `ДД.ММ.ГГГГ` без зависимости от пакета intl.
String? _formatDate(String? value) {
  if (value == null || value.length < 10) {
    return null;
  }
  final year = value.substring(0, 4);
  final month = value.substring(5, 7);
  final day = value.substring(8, 10);
  return '$day.$month.$year';
}
