/// Статус оплаты глазами участника (B).
///
/// Суммы сюда не входят: BR-010 закрывает финансы для MEMBER, и решение продукта —
/// показывать только факт. Родителю нужен ответ «я все сделал или нет», а не
/// «сколько осталось».
library;

/// Что видит участник.
enum AthletePaymentStatus {
  /// Оплачено: остатка нет или он в пределах допуска.
  paid,

  /// Внесено частично.
  partial,

  /// Ничего не внесено.
  notPaid,

  /// Платить за месяц не нужно: заморозка, отметка об оплате, нет занятий.
  notRequired,

  /// Ожидаемая сумма не задана — нужно уточнить у администратора.
  unknown;

  static AthletePaymentStatus fromCode(String? code) {
    return switch (code) {
      'PAID' => AthletePaymentStatus.paid,
      'PARTIAL' => AthletePaymentStatus.partial,
      'NOT_PAID' => AthletePaymentStatus.notPaid,
      'NOT_REQUIRED' => AthletePaymentStatus.notRequired,
      _ => AthletePaymentStatus.unknown,
    };
  }

  /// Цвет полосы: зеленый — порядок, оранжевый — внимание, серый — нейтрально.
  bool get isAttention => this == AthletePaymentStatus.notPaid || this == AthletePaymentStatus.partial;
}

/// Ответ `GET /me/athletes/{id}/payment-status`.
class PaymentStatus {
  const PaymentStatus({
    required this.year,
    required this.month,
    required this.monthLabel,
    required this.status,
    required this.message,
  });

  final int year;
  final int month;
  final String monthLabel;
  final AthletePaymentStatus status;

  /// Готовая подпись с сервера: одна формулировка на все клиенты.
  final String message;

  factory PaymentStatus.fromJson(Map<String, dynamic> json) {
    return PaymentStatus(
      year: (json['year'] as num?)?.toInt() ?? 0,
      month: (json['month'] as num?)?.toInt() ?? 0,
      monthLabel: (json['monthLabel'] as String?) ?? '',
      status: AthletePaymentStatus.fromCode(json['status'] as String?),
      message: (json['message'] as String?) ?? '',
    );
  }
}
