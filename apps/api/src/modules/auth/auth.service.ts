import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  type AuthSession,
  type UserRole,
  type UserStatus,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { IdentityService } from '../identity/identity.service';
import { AuthRepository } from './auth.repository';
import { PasswordService } from './password.service';
import { RateLimiterService } from './rate-limiter.service';
import { RefreshTokenService } from './refresh-token.service';
import { TokenService } from './token.service';

export interface LoginInput {
  email: string;
  password: string;
  /** IP клиента: используется для лимита попыток (docs/15-security.md). */
  ip?: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly rateLimiter: RateLimiterService,
    private readonly identity: IdentityService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Вход по email и паролю.
   *
   * Лимиты считаются отдельно по IP и отдельно по email: распределенная атака
   * обходит лимит по IP, а медленный перебор одного аккаунта — общий лимит
   * (docs/15-security.md).
   */
  async login(input: LoginInput): Promise<AuthSession> {
    const email = input.email.trim().toLowerCase();

    await this.enforceLimits(email, input.ip ?? null);

    const user = await this.repository.findUserForAuth(email);
    const passwordOk = await this.passwords.verify(input.password, user?.passwordHash ?? null);

    if (!user || !passwordOk) {
      await this.audit.recordSafely({
        action: AuditAction.AUTH_LOGIN_FAILED,
        entityType: AuditEntityType.USER,
        entityId: user?.id ?? null,
        after: { email, reason: user ? 'bad_password' : 'unknown_user' },
      });
      // Одинаковое сообщение для неизвестного email и неверного пароля:
      // не раскрываем существование аккаунта.
      throw new ApiException(
        'INVALID_CREDENTIALS' satisfies ApiErrorCode,
        'Неверный email или пароль',
      );
    }

    if (user.status === ('BLOCKED' satisfies UserStatus)) {
      await this.audit.recordSafely({
        action: AuditAction.AUTH_LOGIN_FAILED,
        entityType: AuditEntityType.USER,
        entityId: user.id,
        after: { email, reason: 'blocked' },
      });
      throw new ApiException('USER_BLOCKED' satisfies ApiErrorCode, 'Учетная запись заблокирована');
    }

    // Приглашенный пользователь еще не задал пароль — вход невозможен.
    if (user.status === ('INVITED' satisfies UserStatus) || !user.passwordHash) {
      await this.audit.recordSafely({
        action: AuditAction.AUTH_LOGIN_FAILED,
        entityType: AuditEntityType.USER,
        entityId: user.id,
        after: { email, reason: 'invite_not_accepted' },
      });
      throw new ApiException(
        'INVITE_INVALID' satisfies ApiErrorCode,
        'Приглашение не принято: задайте пароль',
      );
    }

    await this.repository.markLogin(user.id);

    const session = await this.issueSession(user.id, user.email, user.role);

    await this.audit.recordSafely({
      action: AuditAction.AUTH_LOGIN_SUCCEEDED,
      entityType: AuditEntityType.USER,
      entityId: user.id,
    });

    return session;
  }

  /**
   * Обновление сессии по refresh-токену с ротацией.
   *
   * Недействительный или уже использованный токен трактуется как возможная
   * компрометация: RefreshTokenService отзывает все токены пользователя,
   * событие попадает в аудит.
   */
  async refresh(refreshToken: string): Promise<AuthSession> {
    let rotated: Awaited<ReturnType<RefreshTokenService['rotate']>>;
    try {
      rotated = await this.refreshTokens.rotate(refreshToken);
    } catch (error) {
      await this.audit.recordSafely({
        action: AuditAction.AUTH_TOKEN_REUSE_DETECTED,
        entityType: AuditEntityType.REFRESH_TOKEN,
        after: { reason: 'invalid_or_revoked' },
      });
      throw error;
    }

    // Ротация вернула идентификатор владельца токена, поэтому ищем по id,
    // а не по email (findUserForAuth ждет email).
    const user = await this.repository.findUserById(rotated.userId);
    if (!user) {
      throw new ApiException('UNAUTHENTICATED' satisfies ApiErrorCode, 'Пользователь не найден');
    }
    if (user.status === ('BLOCKED' satisfies UserStatus)) {
      throw new ApiException('USER_BLOCKED' satisfies ApiErrorCode, 'Учетная запись заблокирована');
    }

    const access = await this.tokens.issueAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    await this.audit.recordSafely({
      action: AuditAction.AUTH_TOKEN_REFRESHED,
      entityType: AuditEntityType.REFRESH_TOKEN,
      entityId: user.id,
      // Автор указывается явно: маршрут `/auth/refresh` не защищен guard'ом
      // (refresh-токен приходит в теле), поэтому контекст запроса не знает
      // пользователя. Без этого обновление сессии попадало в журнал без
      // действующего лица.
      actorUserId: user.id,
    });

    return {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken: rotated.refresh.token,
      refreshExpiresAt: rotated.refresh.expiresAt.toISOString(),
      user: await this.identity.getProfile(user.id),
    };
  }

  /** Выход: отзывает конкретный refresh-токен. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    await this.refreshTokens.revoke(refreshToken);
    await this.audit.recordSafely({
      action: AuditAction.AUTH_LOGOUT,
      entityType: AuditEntityType.REFRESH_TOKEN,
    });
  }

  /**
   * Лимит на попытки подбора токена приглашения.
   *
   * Считается только по IP: лимит по email здесь не нужен (приглашающий и
   * принимающий — разные люди), а токен является секретом.
   */
  async enforceInviteRateLimit(ip: string | null): Promise<void> {
    if (!ip) {
      return;
    }

    const result = await this.rateLimiter.consume(
      `invite-accept:ip:${ip}`,
      Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
      Number(process.env.AUTH_RATE_LIMIT_TTL_SECONDS ?? 60),
    );

    if (!result.allowed) {
      this.logger.warn(`Превышен лимит попыток принятия приглашения по IP ${ip}`);
      throw new ApiException(
        'RATE_LIMITED' satisfies ApiErrorCode,
        'Слишком много попыток, попробуйте позже',
      );
    }
  }

  private async issueSession(userId: string, email: string, role: UserRole): Promise<AuthSession> {
    const access = await this.tokens.issueAccessToken({ sub: userId, email, role });
    const refresh = await this.refreshTokens.issue(userId);

    return {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt.toISOString(),
      user: await this.identity.getProfile(userId),
    };
  }

  private async enforceLimits(email: string, ip: string | null): Promise<void> {
    const max = Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10);
    const windowSeconds = Number(process.env.AUTH_RATE_LIMIT_TTL_SECONDS ?? 60);

    if (ip) {
      const byIp = await this.rateLimiter.consume(`auth:ip:${ip}`, max, windowSeconds);
      if (!byIp.allowed) {
        this.logger.warn(`Превышен лимит попыток входа по IP ${ip}`);
        throw new ApiException(
          'RATE_LIMITED' satisfies ApiErrorCode,
          'Слишком много попыток входа, попробуйте позже',
        );
      }
    }

    const byEmail = await this.rateLimiter.consume(`auth:email:${email}`, max, windowSeconds);
    if (!byEmail.allowed) {
      this.logger.warn('Превышен лимит попыток входа по email');
      throw new ApiException(
        'RATE_LIMITED' satisfies ApiErrorCode,
        'Слишком много попыток входа, попробуйте позже',
      );
    }
  }
}
