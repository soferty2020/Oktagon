import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { AppEnvironment } from '@octagon/config';

export interface AccessTokenPayload {
  /** user id */
  sub: string;
  email: string;
  role: string;
}

export interface IssuedAccessToken {
  token: string;
  expiresIn: number;
}

/**
 * Access-токены (docs/09-api.md: access + refresh, docs/15-security.md:
 * короткоживущий access-токен).
 *
 * Права в токен не кладутся: по ADR-0006 они вычисляются на backend на каждом
 * запросе, иначе отзыв права не действовал бы до истечения токена.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {}

  async issueAccessToken(payload: AccessTokenPayload): Promise<IssuedAccessToken> {
    const expiresIn = this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn,
    });
    return { token, expiresIn };
  }

  /** Проверяет access-токен и возвращает payload. Бросает при невалидном токене. */
  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }
}
