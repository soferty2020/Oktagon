import { createHash, randomUUID } from 'node:crypto';

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { AppEnvironment } from '@octagon/config';
import { PrismaService } from '../../prisma';

/** DI-токен: упрощает подмену в тестах. */
export const REFRESH_TOKEN_SERVICE = 'REFRESH_TOKEN_SERVICE';

interface RefreshTokenPayload {
  sub: string;
  /** идентификатор записи RefreshToken */
  jti: string;
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

/** Подпись refresh-токена: секрет и TTL берутся из конфигурации. */
@Injectable()
export class RefreshTokenSigner {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {}

  async sign(payload: RefreshTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_REFRESH_TTL_SECONDS', { infer: true }),
    });
  }

  async verify(token: string): Promise<RefreshTokenPayload> {
    return this.jwt.verifyAsync<RefreshTokenPayload>(token, {
      secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
    });
  }

  ttlSeconds(): number {
    return this.config.get('JWT_REFRESH_TTL_SECONDS', { infer: true });
  }
}

/** Считает хеш токена для хранения: сам токен в БД не попадает. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Refresh-токены с ротацией (docs/15-security.md: refresh token rotation
 * recommended).
 *
 * В БД хранится только SHA-256-хеш токена. При предъявлении уже
 * использованного токена отзываются все активные токены пользователя: это
 * стандартная реакция на возможную кражу refresh-токена.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signer: RefreshTokenSigner,
  ) {}

  /** Выдает новую пару: запись в БД + подписанный токен. */
  async issue(userId: string): Promise<IssuedRefreshToken> {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + this.signer.ttlSeconds() * 1000);
    const token = await this.signer.sign({ sub: userId, jti: id });

    await this.prisma.db.refreshToken.create({
      data: {
        id,
        userId,
        tokenHash: hashRefreshToken(token),
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  /**
   * Ротирует токен: старый отзывается, выдается новый.
   *
   * @throws UnauthorizedException если токен недействителен, отозван, истек
   * либо не найден.
   */
  async rotate(token: string): Promise<{ userId: string; refresh: IssuedRefreshToken }> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.signer.verify(token);
    } catch {
      throw new UnauthorizedException('Refresh-токен недействителен');
    }

    const stored = await this.prisma.db.refreshToken.findUnique({
      where: { id: payload.jti },
      select: { id: true, userId: true, tokenHash: true, expiresAt: true, revokedAt: true },
    });

    if (!stored || stored.tokenHash !== hashRefreshToken(token) || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh-токен не найден');
    }

    if (stored.revokedAt) {
      // Повторное использование отозванного токена — признак компрометации.
      await this.revokeAllForUser(stored.userId);
      this.logger.warn(
        `Обнаружено повторное использование refresh-токена пользователя ${stored.userId}: все токены отозваны`,
      );
      throw new UnauthorizedException('Refresh-токен отозван');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh-токен истек');
    }

    await this.prisma.db.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const refresh = await this.issue(stored.userId);
    return { userId: stored.userId, refresh };
  }

  /** Отзывает один токен (выход из системы). */
  async revoke(token: string): Promise<void> {
    try {
      const payload = await this.signer.verify(token);
      await this.prisma.db.refreshToken.updateMany({
        where: { id: payload.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Выход с невалидным токеном не является ошибкой: цель уже достигнута.
    }
  }

  /** Отзывает все активные токены пользователя. */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
}
