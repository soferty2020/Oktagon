import { Injectable } from '@nestjs/common';

import { TokenService, type AccessTokenPayload } from '../modules/auth/token.service';

/**
 * Проверка access-токена из заголовка Authorization.
 *
 * Живет в shared, а не в модуле auth: AuthGuard используется всеми доменными
 * модулями (identity, athletes, ...), и зависимость на модуль auth создала бы
 * цикл auth -> identity -> auth.
 */
@Injectable()
export class AccessTokenVerifier {
  constructor(private readonly tokens: TokenService) {}

  /** Возвращает payload либо null, если токен недействителен или истек. */
  async verify(token: string): Promise<AccessTokenPayload | null> {
    try {
      return await this.tokens.verifyAccessToken(token);
    } catch {
      // Детали проверки токена клиенту не раскрываем.
      return null;
    }
  }
}
