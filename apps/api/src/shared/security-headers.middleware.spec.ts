import { SecurityHeadersMiddleware } from './security-headers.middleware';

/**
 * Тесты заголовков безопасности (docs/15-security.md).
 *
 * Проверяется то, что легко потерять при рефакторинге: заголовки должны стоять
 * на каждом ответе, а HSTS — только там, где есть HTTPS.
 */
describe('SecurityHeadersMiddleware', () => {
  const runWith = (isProduction: boolean) => {
    const headers: Record<string, string> = {};
    const response = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    };
    const middleware = new SecurityHeadersMiddleware(isProduction);
    const next = jest.fn();

    middleware.use({} as never, response as never, next);

    return { headers, next };
  };

  it('запрещает угадывание типа ответа', () => {
    const { headers } = runWith(false);

    // Без nosniff браузер мог бы исполнить JSON как скрипт в некоторых сценариях.
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('запрещает встраивание в фрейм', () => {
    const { headers } = runWith(false);

    expect(headers['X-Frame-Options']).toBe('DENY');
  });

  it('не передает адрес API сторонним сайтам', () => {
    const { headers } = runWith(false);

    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['Cross-Origin-Resource-Policy']).toBe('same-site');
  });

  it('не ставит HSTS вне production', () => {
    // В local и staging браузер работает по HTTP: HSTS заставил бы его
    // требовать HTTPS и сломал бы разработку.
    expect(runWith(false).headers['Strict-Transport-Security']).toBeUndefined();
  });

  it('в production требует HTTPS на год, включая поддомены', () => {
    const { headers } = runWith(true);

    expect(headers['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
  });

  it('всегда передает управление дальше', () => {
    expect(runWith(false).next).toHaveBeenCalled();
    expect(runWith(true).next).toHaveBeenCalled();
  });
});
