import { Injectable } from '@nestjs/common';

/**
 * Заготовка модуля auth.
 *
 * Спецификация: docs/01-mvp-scope.md (email/password), docs/09-api.md (access + refresh token), docs/15-security.md (rate limiting, rotation).
 * Публичный контракт модуля согласуется до реализации
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Injectable()
export class AuthService {}
