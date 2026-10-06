import { EnvironmentValidationError, loadEnvironment, resolveCorsOrigins } from './environment';

const VALID_SECRET = 'a'.repeat(40);

/** Минимум, чтобы окружение прошло валидацию. */
const validEnv = {
  DATABASE_URL: 'postgresql://octagon:octagon@localhost:5432/octagon',
  JWT_ACCESS_SECRET: VALID_SECRET,
  JWT_REFRESH_SECRET: VALID_SECRET,
};

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
        'JWT_ACCESS_SECRET must be at least 32 characters',
        'JWT_REFRESH_SECRET is required',
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

  it('требует явный список источников вне local', () => {
    // CORS с cookie и «любым» источником означал бы, что сторонний сайт
    // обращается к API от имени вошедшего пользователя (docs/15-security.md).
    // Поэтому staging и production без списка не поднимаются вовсе.
    expect(() => loadEnvironment({ ...validEnv, NODE_ENV: 'production' })).toThrow(
      EnvironmentValidationError,
    );
    expect(() => loadEnvironment({ ...validEnv, NODE_ENV: 'staging' })).toThrow(
      EnvironmentValidationError,
    );

    const env = loadEnvironment({
      ...validEnv,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://admin.octagon.kz',
    });
    expect(env.NODE_ENV).toBe('production');
  });

  it('локально список не обязателен', () => {
    const env = loadEnvironment(validEnv);

    expect(env.NODE_ENV).toBe('local');
    expect(env.CORS_ORIGINS).toBeUndefined();
  });
});

describe('resolveCorsOrigins', () => {
  it('локально разрешает любой источник: админка ходит с разных портов', () => {
    // localhost:3001 и 127.0.0.1:3001 для браузера — разные источники, и
    // требовать список на машине разработчика было бы неудобно.
    expect(resolveCorsOrigins({ NODE_ENV: 'local' })).toBe(true);
    expect(resolveCorsOrigins({ NODE_ENV: 'test' })).toBe(true);
  });

  it('разбирает список источников', () => {
    expect(
      resolveCorsOrigins({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://admin.octagon.kz, https://octagon.kz',
      }),
    ).toEqual(['https://admin.octagon.kz', 'https://octagon.kz']);
  });

  it('без списка в production не разрешает никого', () => {
    // Пустой список безопаснее «любого источника»: cross-origin запросов не
    // будет, и API останется доступен только своим же origin.
    expect(resolveCorsOrigins({ NODE_ENV: 'production' })).toEqual([]);
    expect(resolveCorsOrigins({ NODE_ENV: 'production', CORS_ORIGINS: '  ,  ' })).toEqual([]);
  });

  it('заданный список действует и локально', () => {
    expect(
      resolveCorsOrigins({ NODE_ENV: 'local', CORS_ORIGINS: 'http://localhost:3001' }),
    ).toEqual(['http://localhost:3001']);
  });
});
