import { EnvironmentValidationError, loadEnvironment } from './environment';

const VALID_SECRET = 'a'.repeat(40);

describe('loadEnvironment', () => {
  it('fills defaults for a minimal valid environment', () => {
    const env = loadEnvironment({
      DATABASE_URL: 'postgresql://octagon:octagon@localhost:5432/octagon',
      JWT_ACCESS_SECRET: VALID_SECRET,
      JWT_REFRESH_SECRET: VALID_SECRET,
    });

    expect(env.NODE_ENV).toBe('local');
    expect(env.PORT).toBe(3000);
    expect(env.API_PREFIX).toBe('api/v1');
    expect(env.CLUB_TIMEZONE).toBe('Asia/Almaty');
  });

  it('reports every problem at once, one per field', () => {
    // короткий JWT_ACCESS_SECRET + отсутствующие refresh-секрет и DATABASE_URL
    try {
      loadEnvironment({ JWT_ACCESS_SECRET: 'short' });
      throw new Error('expected loadEnvironment to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      expect((error as EnvironmentValidationError).problems).toEqual([
        'JWT_REFRESH_SECRET is required',
        'JWT_ACCESS_SECRET must be at least 32 characters',
        'DATABASE_URL is required',
      ]);
    }
  });

  it('rejects a non-IANA time zone', () => {
    expect(() =>
      loadEnvironment({
        DATABASE_URL: 'postgresql://localhost:5432/octagon',
        JWT_ACCESS_SECRET: VALID_SECRET,
        JWT_REFRESH_SECRET: VALID_SECRET,
        CLUB_TIMEZONE: 'Mars/Olympus',
      }),
    ).toThrow(EnvironmentValidationError);
  });

  it('rejects non-positive numeric settings', () => {
    expect(() =>
      loadEnvironment({
        DATABASE_URL: 'postgresql://localhost:5432/octagon',
        JWT_ACCESS_SECRET: VALID_SECRET,
        JWT_REFRESH_SECRET: VALID_SECRET,
        PORT: '0',
      }),
    ).toThrow(EnvironmentValidationError);
  });
});
