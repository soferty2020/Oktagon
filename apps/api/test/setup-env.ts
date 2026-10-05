/**
 * Переменные окружения для e2e-тестов.
 *
 * Загружается Jest до импорта тестируемых модулей: ConfigModule валидирует
 * окружение на этапе импорта, поэтому переменные должны быть заданы раньше.
 * Значения — только для тестового контура, не секреты.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://octagon:octagon@localhost:5432/octagon_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-value-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-value-32-characters-long';
process.env.CLUB_TIMEZONE = process.env.CLUB_TIMEZONE ?? 'Asia/Almaty';
process.env.LOG_LEVEL = 'error';
