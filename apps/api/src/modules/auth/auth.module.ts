import { Module } from '@nestjs/common';

import { AuthService } from './auth.service';

/**
 * Модуль auth.
 *
 * Спецификация: docs/01-mvp-scope.md (email/password), docs/09-api.md (access + refresh token), docs/15-security.md (rate limiting, rotation).
 * Публичный контракт и бизнес-логика добавляются отдельным issue
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Module({
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
