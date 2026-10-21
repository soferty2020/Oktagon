/// Ошибка обращения к API.
///
/// Код (`code`) приходит от backend в теле ответа и является частью контракта
/// (`packages/contracts/src/errors.ts`). По нему интерфейс решает, что показать:
/// «неверный пароль» и «сервер недоступен» требуют разных действий от человека,
/// и общий текст «ошибка» заставил бы его гадать.
class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.message,
    this.statusCode,
  });

  /// Код ошибки контракта (`INVALID_CREDENTIALS`, `USER_BLOCKED`, ...).
  ///
  /// Для сетевых сбоев используется собственный код `NETWORK`: backend в этом
  /// случае ответа не давал.
  final String code;

  /// Текст для пользователя. Backend присылает его на русском.
  final String message;

  /// HTTP-статус, если ответ был получен.
  final int? statusCode;

  /// Ошибка сети или таймаута: запрос не дошел до backend.
  bool get isNetwork => code == 'NETWORK';

  @override
  String toString() => 'ApiException($code): $message';
}
