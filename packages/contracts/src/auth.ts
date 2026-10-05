/**
 * Контракт аутентификации (docs/09-api.md, docs/23-api-contract-plan.md).
 *
 * Права в токен не попадают: клиент получает профиль с эффективными правами
 * в ответе на вход, а backend вычисляет их на каждом запросе (ADR-0006).
 */

import type { UserProfile } from './identity';

export interface AuthTokens {
  accessToken: string;
  /** Время жизни access-токена в секундах. */
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string;
}

/** Ответ `POST /auth/login` и `POST /auth/refresh`. */
export interface AuthSession extends AuthTokens {
  user: UserProfile;
}
