export declare const NodeEnv: {
    readonly LOCAL: "local";
    readonly TEST: "test";
    readonly STAGING: "staging";
    readonly PRODUCTION: "production";
};
export type NodeEnv = (typeof NodeEnv)[keyof typeof NodeEnv];
export declare const NODE_ENVS: readonly NodeEnv[];
export interface AppEnvironment {
    NODE_ENV: NodeEnv;
    PORT: number;
    API_PREFIX: string;
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
export declare class EnvironmentValidationError extends Error {
    readonly problems: string[];
    constructor(problems: string[]);
}
export declare const ENVIRONMENT_DEFAULTS: {
    readonly NODE_ENV: "local";
    readonly PORT: 3000;
    readonly API_PREFIX: "api/v1";
    readonly CLUB_TIMEZONE: "Asia/Almaty";
    readonly JWT_ACCESS_TTL_SECONDS: 900;
    readonly JWT_REFRESH_TTL_SECONDS: 1209600;
    readonly AUTH_RATE_LIMIT_TTL_SECONDS: 60;
    readonly AUTH_RATE_LIMIT_MAX: 10;
    readonly INVITE_TTL_HOURS: 72;
    readonly LOG_LEVEL: "info";
};
export declare function loadEnvironment(raw?: RawEnvironment): AppEnvironment;
