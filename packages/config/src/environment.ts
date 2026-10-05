/**
 * Не-секретные схемы конфигурации (docs/13-architecture.md: packages/config).
 *
 * Секреты не хранятся в репозитории (docs/15-security.md) — здесь только
 * имена переменных окружения, значения по умолчанию и валидация формы.
 */

export const NodeEnv = {
  LOCAL: 'local',
  TEST: 'test',
  STAGING: 'staging',
  PRODUCTION: 'production',
} as const;
export type NodeEnv = (typeof NodeEnv)[keyof typeof NodeEnv];

export const NODE_ENVS: readonly NodeEnv[] = Object.values(NodeEnv);

export interface AppEnvironment {
  NODE_ENV: NodeEnv;
  PORT: number;
  API_PREFIX: string;
  /** Локальная timezone клуба; хранится в конфигурации (docs/08-database.md). */
  CLUB_TIMEZONE: string;
  DATABASE_URL: string;
  REDIS_URL?: string;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_TTL_SECONDS: number;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_TTL_SECONDS: number;
  AUTH_RATE_LIMIT_TTL_SECONDS: number;
  AUTH_RATE_LIMIT_MAX: number;
  INVITE_TTL_HOURS: number;
  LOG_LEVEL: string;
}

export type RawEnvironment = Record<string, string | undefined>;

export class EnvironmentValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n- ${problems.join('\n- ')}`);
    this.name = 'EnvironmentValidationError';
  }
}

/** Значения по умолчанию для локальной разработки (не секреты). */
export const ENVIRONMENT_DEFAULTS = {
  NODE_ENV: NodeEnv.LOCAL,
  PORT: 3000,
  API_PREFIX: 'api/v1',
  CLUB_TIMEZONE: 'Asia/Almaty',
  JWT_ACCESS_TTL_SECONDS: 900,
  JWT_REFRESH_TTL_SECONDS: 1_209_600,
  AUTH_RATE_LIMIT_TTL_SECONDS: 60,
  AUTH_RATE_LIMIT_MAX: 10,
  INVITE_TTL_HOURS: 72,
  LOG_LEVEL: 'info',
} as const;

function parsePositiveInt(
  raw: string | undefined,
  fallback: number | undefined,
  name: string,
  problems: string[],
): number {
  if (raw === undefined || raw === '') {
    if (fallback === undefined) {
      problems.push(`${name} is required`);
      return 0;
    }
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    problems.push(`${name} must be a positive integer, got "${raw}"`);
    return 0;
  }
  return parsed;
}

function requireString(raw: string | undefined, name: string, problems: string[]): string {
  if (raw === undefined || raw.trim() === '') {
    problems.push(`${name} is required`);
    return '';
  }
  return raw;
}

/**
 * Валидирует и нормализует переменные окружения. Бросает
 * EnvironmentValidationError со списком всех проблем сразу.
 */
export function loadEnvironment(raw: RawEnvironment = process.env): AppEnvironment {
  const problems: string[] = [];

  const nodeEnvRaw = raw.NODE_ENV ?? ENVIRONMENT_DEFAULTS.NODE_ENV;
  if (!NODE_ENVS.includes(nodeEnvRaw as NodeEnv)) {
    problems.push(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}, got "${nodeEnvRaw}"`);
  }

  const jwtAccessSecret = raw.JWT_ACCESS_SECRET ?? '';
  const jwtRefreshSecret = raw.JWT_REFRESH_SECRET ?? '';
  if (jwtAccessSecret === '') {
    problems.push('JWT_ACCESS_SECRET is required');
  } else if (jwtAccessSecret.length < 32) {
    problems.push('JWT_ACCESS_SECRET must be at least 32 characters');
  }
  if (jwtRefreshSecret === '') {
    problems.push('JWT_REFRESH_SECRET is required');
  } else if (jwtRefreshSecret.length < 32) {
    problems.push('JWT_REFRESH_SECRET must be at least 32 characters');
  }

  const clubTimezone = raw.CLUB_TIMEZONE ?? ENVIRONMENT_DEFAULTS.CLUB_TIMEZONE;
  if (!isValidTimeZone(clubTimezone)) {
    problems.push(`CLUB_TIMEZONE is not a valid IANA time zone, got "${clubTimezone}"`);
  }

  const env: AppEnvironment = {
    NODE_ENV: nodeEnvRaw as NodeEnv,
    PORT: parsePositiveInt(raw.PORT, ENVIRONMENT_DEFAULTS.PORT, 'PORT', problems),
    API_PREFIX: raw.API_PREFIX ?? ENVIRONMENT_DEFAULTS.API_PREFIX,
    CLUB_TIMEZONE: clubTimezone,
    DATABASE_URL: requireString(raw.DATABASE_URL, 'DATABASE_URL', problems),
    REDIS_URL: raw.REDIS_URL,
    JWT_ACCESS_SECRET: jwtAccessSecret,
    JWT_ACCESS_TTL_SECONDS: parsePositiveInt(
      raw.JWT_ACCESS_TTL_SECONDS,
      ENVIRONMENT_DEFAULTS.JWT_ACCESS_TTL_SECONDS,
      'JWT_ACCESS_TTL_SECONDS',
      problems,
    ),
    JWT_REFRESH_SECRET: jwtRefreshSecret,
    JWT_REFRESH_TTL_SECONDS: parsePositiveInt(
      raw.JWT_REFRESH_TTL_SECONDS,
      ENVIRONMENT_DEFAULTS.JWT_REFRESH_TTL_SECONDS,
      'JWT_REFRESH_TTL_SECONDS',
      problems,
    ),
    AUTH_RATE_LIMIT_TTL_SECONDS: parsePositiveInt(
      raw.AUTH_RATE_LIMIT_TTL_SECONDS,
      ENVIRONMENT_DEFAULTS.AUTH_RATE_LIMIT_TTL_SECONDS,
      'AUTH_RATE_LIMIT_TTL_SECONDS',
      problems,
    ),
    AUTH_RATE_LIMIT_MAX: parsePositiveInt(
      raw.AUTH_RATE_LIMIT_MAX,
      ENVIRONMENT_DEFAULTS.AUTH_RATE_LIMIT_MAX,
      'AUTH_RATE_LIMIT_MAX',
      problems,
    ),
    INVITE_TTL_HOURS: parsePositiveInt(
      raw.INVITE_TTL_HOURS,
      ENVIRONMENT_DEFAULTS.INVITE_TTL_HOURS,
      'INVITE_TTL_HOURS',
      problems,
    ),
    LOG_LEVEL: raw.LOG_LEVEL ?? ENVIRONMENT_DEFAULTS.LOG_LEVEL,
  };

  if (problems.length > 0) {
    throw new EnvironmentValidationError(problems);
  }

  return env;
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
