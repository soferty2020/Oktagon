"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENVIRONMENT_DEFAULTS = exports.EnvironmentValidationError = exports.NODE_ENVS = exports.NodeEnv = void 0;
exports.loadEnvironment = loadEnvironment;
exports.NodeEnv = {
    LOCAL: 'local',
    TEST: 'test',
    STAGING: 'staging',
    PRODUCTION: 'production',
};
exports.NODE_ENVS = Object.values(exports.NodeEnv);
class EnvironmentValidationError extends Error {
    problems;
    constructor(problems) {
        super(`Invalid environment configuration:\n- ${problems.join('\n- ')}`);
        this.problems = problems;
        this.name = 'EnvironmentValidationError';
    }
}
exports.EnvironmentValidationError = EnvironmentValidationError;
exports.ENVIRONMENT_DEFAULTS = {
    NODE_ENV: exports.NodeEnv.LOCAL,
    PORT: 3000,
    API_PREFIX: 'api/v1',
    CLUB_TIMEZONE: 'Asia/Almaty',
    JWT_ACCESS_TTL_SECONDS: 900,
    JWT_REFRESH_TTL_SECONDS: 1_209_600,
    AUTH_RATE_LIMIT_TTL_SECONDS: 60,
    AUTH_RATE_LIMIT_MAX: 10,
    INVITE_TTL_HOURS: 72,
    LOG_LEVEL: 'info',
};
function parsePositiveInt(raw, fallback, name, problems) {
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
function requireString(raw, name, problems) {
    if (raw === undefined || raw.trim() === '') {
        problems.push(`${name} is required`);
        return '';
    }
    return raw;
}
function loadEnvironment(raw = process.env) {
    const problems = [];
    const nodeEnvRaw = raw.NODE_ENV ?? exports.ENVIRONMENT_DEFAULTS.NODE_ENV;
    if (!exports.NODE_ENVS.includes(nodeEnvRaw)) {
        problems.push(`NODE_ENV must be one of ${exports.NODE_ENVS.join(', ')}, got "${nodeEnvRaw}"`);
    }
    const jwtAccessSecret = requireString(raw.JWT_ACCESS_SECRET, 'JWT_ACCESS_SECRET', problems);
    const jwtRefreshSecret = requireString(raw.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET', problems);
    if (jwtAccessSecret && jwtAccessSecret.length < 32) {
        problems.push('JWT_ACCESS_SECRET must be at least 32 characters');
    }
    if (jwtRefreshSecret && jwtRefreshSecret.length < 32) {
        problems.push('JWT_REFRESH_SECRET must be at least 32 characters');
    }
    const clubTimezone = raw.CLUB_TIMEZONE ?? exports.ENVIRONMENT_DEFAULTS.CLUB_TIMEZONE;
    if (!isValidTimeZone(clubTimezone)) {
        problems.push(`CLUB_TIMEZONE is not a valid IANA time zone, got "${clubTimezone}"`);
    }
    const env = {
        NODE_ENV: nodeEnvRaw,
        PORT: parsePositiveInt(raw.PORT, exports.ENVIRONMENT_DEFAULTS.PORT, 'PORT', problems),
        API_PREFIX: raw.API_PREFIX ?? exports.ENVIRONMENT_DEFAULTS.API_PREFIX,
        CLUB_TIMEZONE: clubTimezone,
        DATABASE_URL: requireString(raw.DATABASE_URL, 'DATABASE_URL', problems),
        REDIS_URL: raw.REDIS_URL,
        JWT_ACCESS_SECRET: jwtAccessSecret,
        JWT_ACCESS_TTL_SECONDS: parsePositiveInt(raw.JWT_ACCESS_TTL_SECONDS, exports.ENVIRONMENT_DEFAULTS.JWT_ACCESS_TTL_SECONDS, 'JWT_ACCESS_TTL_SECONDS', problems),
        JWT_REFRESH_SECRET: jwtRefreshSecret,
        JWT_REFRESH_TTL_SECONDS: parsePositiveInt(raw.JWT_REFRESH_TTL_SECONDS, exports.ENVIRONMENT_DEFAULTS.JWT_REFRESH_TTL_SECONDS, 'JWT_REFRESH_TTL_SECONDS', problems),
        AUTH_RATE_LIMIT_TTL_SECONDS: parsePositiveInt(raw.AUTH_RATE_LIMIT_TTL_SECONDS, exports.ENVIRONMENT_DEFAULTS.AUTH_RATE_LIMIT_TTL_SECONDS, 'AUTH_RATE_LIMIT_TTL_SECONDS', problems),
        AUTH_RATE_LIMIT_MAX: parsePositiveInt(raw.AUTH_RATE_LIMIT_MAX, exports.ENVIRONMENT_DEFAULTS.AUTH_RATE_LIMIT_MAX, 'AUTH_RATE_LIMIT_MAX', problems),
        INVITE_TTL_HOURS: parsePositiveInt(raw.INVITE_TTL_HOURS, exports.ENVIRONMENT_DEFAULTS.INVITE_TTL_HOURS, 'INVITE_TTL_HOURS', problems),
        LOG_LEVEL: raw.LOG_LEVEL ?? exports.ENVIRONMENT_DEFAULTS.LOG_LEVEL,
    };
    if (problems.length > 0) {
        throw new EnvironmentValidationError(problems);
    }
    return env;
}
function isValidTimeZone(timeZone) {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone });
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=environment.js.map