import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { AuthController } from './auth.controller';
import { AuthRepository, PrismaAuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { InviteRepository, PrismaInviteRepository } from './invite.repository';
import { InviteService } from './invite.service';
import { PasswordService } from './password.service';
import { RATE_LIMIT_REDIS, RateLimiterService } from './rate-limiter.service';
import { RefreshTokenService, RefreshTokenSigner } from './refresh-token.service';
import { UsersController } from './users.controller';

/**
 * Модуль auth (issues B2, B3).
 *
 * Спецификация: docs/01-mvp-scope.md (email/password, приглашения),
 * docs/09-api.md (access + refresh), docs/15-security.md (rate limiting,
 * rotation), ADR-0004 (Argon2id), docs/04-roles-permissions.md (users.manage).
 *
 * JwtModule, TokenService, AccessTokenVerifier и AuthGuard приходят из
 * глобального TokenModule (apps/api/src/shared/token.module.ts).
 * IdentityModule дает IdentityService (профиль в ответе на вход) и
 * PermissionsGuard (проверка users.manage при выдаче приглашений).
 */
@Module({
  imports: [IdentityModule],
  controllers: [AuthController, UsersController],
  providers: [
    AuthService,
    PasswordService,
    RefreshTokenService,
    RefreshTokenSigner,
    InviteService,
    PrismaAuthRepository,
    PrismaInviteRepository,
    { provide: AuthRepository, useExisting: PrismaAuthRepository },
    { provide: InviteRepository, useExisting: PrismaInviteRepository },
    RateLimiterService,
    // Явное undefined: по умолчанию лимитер берет клиент из RedisModule.
    { provide: RATE_LIMIT_REDIS, useValue: undefined },
  ],
  exports: [AuthService, PasswordService, InviteService],
})
export class AuthModule {}
