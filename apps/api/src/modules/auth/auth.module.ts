import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { AuthController } from './auth.controller';
import { AuthRepository, PrismaAuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RATE_LIMIT_REDIS, RateLimiterService } from './rate-limiter.service';
import { RefreshTokenService, RefreshTokenSigner } from './refresh-token.service';

/**
 * Модуль auth (issue B2).
 *
 * Спецификация: docs/01-mvp-scope.md (email/password), docs/09-api.md
 * (access + refresh), docs/15-security.md (rate limiting, rotation),
 * ADR-0004 (Argon2id).
 *
 * JwtModule, TokenService, AccessTokenVerifier и AuthGuard приходят из
 * глобального TokenModule (apps/api/src/shared/token.module.ts).
 * Зависит от IdentityModule, чтобы вернуть профиль с эффективными правами в
 * ответе на вход.
 */
@Module({
  imports: [IdentityModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    RefreshTokenService,
    RefreshTokenSigner,
    PrismaAuthRepository,
    { provide: AuthRepository, useExisting: PrismaAuthRepository },
    RateLimiterService,
    // Явное undefined: по умолчанию лимитер берет клиент из RedisModule.
    { provide: RATE_LIMIT_REDIS, useValue: undefined },
  ],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
