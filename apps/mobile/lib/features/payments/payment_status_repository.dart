import '../../core/api_client.dart';
import '../../core/api_exception.dart';
import 'payment_status_models.dart';

/// Статус оплаты спортсмена (B).
///
/// Отдельный эндпоинт от `/debts`: тот отдаёт суммы и требует `payments.view`,
/// а участнику нужен только факт и только по своим детям.
class PaymentStatusRepository {
  PaymentStatusRepository({required ApiClient client}) : _client = client;

  final ApiClient _client;

  /// Статус за месяц; `null`, если спортсмен недоступен аккаунту.
  ///
  /// Ошибки не пробрасываются наверх: главная не должна ломаться из-за одного
  /// блока. Сеть и отказы возвращают `null`, и строка просто не показывается.
  Future<PaymentStatus?> forAthlete({
    required String token,
    required String athleteId,
    required DateTime month,
  }) async {
    try {
      final response = await _client.getJson(
        '/me/athletes/$athleteId/payment-status',
        token: token,
        query: {
          'year': month.year.toString(),
          'month': month.month.toString(),
        },
      );

      return PaymentStatus.fromJson(response);
    } on ApiException {
      return null;
    }
  }
}
