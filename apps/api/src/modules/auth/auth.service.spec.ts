import { ConfigService } from '@nestjs/config';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { IdentityService } from '../identity/identity.service';
import { AuthRepository, type AuthUserRecord } from './auth.repository';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RateLimiterService } from './rate-limiter.service';
import { RefreshTokenService } from './refresh-token.service';
import { TokenService } from './token.service';
import type { UserProfile } from '@octagon/contracts';

const activeUser: AuthUserRecord = {
  id: 'user-1',
  email: 'parent@example.com',
  passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$salt$hash',
  role: 'MEMBER',
  status: 'ACTIVE',
};

const profile = {
  id: 'user-1',
  email: 'parent@example.com',
  permissions: { codes: [], grants: [] },
} as unknown as UserProfile;

describe('AuthService', () => {
  let repository: jest.Mocked<AuthRepository>;
  let passwords: { hash: jest.Mock; verify: jest.Mock };
  let tokens: { issueAccessToken: jest.Mock; verifyAccessToken: jest.Mock };
  let refreshTokens: { issue: jest.Mock; rotate: jest.Mock; revoke: jest.Mock };
  let rateLimiter: { consume: jest.Mock };
  let config: { get: (key: string) => unknown };
  let identity: { getProfile: jest.Mock };
  let audit: { recordSafely: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    repository = {
      findUserForAuth: jest.fn().mockResolvedValue(activeUser),
      findUserById: jest.fn().mockResolvedValue(activeUser),
      markLogin: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuthRepository>;
    passwords = { hash: jest.fn(), verify: jest.fn().mockResolvedValue(true) };
    tokens = {
      issueAccessToken: jest.fn().mockResolvedValue({ token: 'access-token', expiresIn: 900 }),
      verifyAccessToken: jest.fn(),
    };
    refreshTokens = {
      issue: jest
        .fn()
        .mockResolvedValue({
          token: 'refresh-token',
          expiresAt: new Date('2026-03-01T00:00:00.000Z'),
        }),
      rotate: jest.fn(),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    rateLimiter = {
      consume: jest.fn().mockResolvedValue({ allowed: true, remaining: 9, retryAfterSeconds: 60 }),
    };
    identity = { getProfile: jest.fn().mockResolvedValue(profile) };
    audit = { recordSafely: jest.fn().mockResolvedValue(null) };
    // Лимиты берутся из конфига, а не из process.env: значение должно быть
    // проверено при старте, иначе опечатка молча снимала бы защиту.
    config = {
      get: (key: string) =>
        key === 'AUTH_RATE_LIMIT_MAX'
          ? 10
          : key === 'AUTH_RATE_LIMIT_TTL_SECONDS'
            ? 60
            : key === 'INVITE_TTL_HOURS'
              ? 72
              : undefined,
    };

    service = new AuthService(
      repository,
      passwords as unknown as PasswordService,
      tokens as unknown as TokenService,
      refreshTokens as unknown as RefreshTokenService,
      rateLimiter as unknown as RateLimiterService,
      identity as unknown as IdentityService,
      audit as unknown as AuditService,
      config as unknown as ConfigService<never, true>,
    );
  });

  it('выдает сессию с профилем, access- и refresh-токенами', async () => {
    const session = await service.login({
      email: '  Parent@Example.com ',
      password: 'Correct-Horse-Battery',
      ip: '10.0.0.1',
    });

    expect(session.accessToken).toBe('access-token');
    expect(session.refreshToken).toBe('refresh-token');
    expect(session.expiresIn).toBe(900);
    expect(session.user).toBe(profile);
    // email нормализуется до нижнего регистра без пробелов
    expect(repository.findUserForAuth).toHaveBeenCalledWith('parent@example.com');
    expect(repository.markLogin).toHaveBeenCalledWith('user-1');
    expect(audit.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login_succeeded' }),
    );
  });

  it('отклоняет неверный пароль без раскрытия существования аккаунта', async () => {
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({ email: 'parent@example.com', password: 'bad' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(audit.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.login_failed',
        after: expect.objectContaining({ reason: 'bad_password' }),
      }),
    );
  });

  it('отдает ту же ошибку для неизвестного email', async () => {
    repository.findUserForAuth.mockResolvedValue(null);

    await expect(
      service.login({ email: 'nobody@example.com', password: 'bad' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(audit.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({ after: expect.objectContaining({ reason: 'unknown_user' }) }),
    );
  });

  it('отклоняет заблокированного пользователя', async () => {
    repository.findUserForAuth.mockResolvedValue({ ...activeUser, status: 'BLOCKED' });

    await expect(
      service.login({ email: 'parent@example.com', password: 'Correct-Horse-Battery' }),
    ).rejects.toMatchObject({ code: 'USER_BLOCKED' });
  });

  it('не пускает пользователя с непринятым приглашением', async () => {
    repository.findUserForAuth.mockResolvedValue({
      ...activeUser,
      status: 'INVITED',
      passwordHash: null,
    });

    await expect(
      service.login({ email: 'parent@example.com', password: 'Correct-Horse-Battery' }),
    ).rejects.toMatchObject({ code: 'INVITE_INVALID' });
  });

  it('ограничивает частоту попыток по email', async () => {
    rateLimiter.consume.mockResolvedValueOnce({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 60,
    });
    rateLimiter.consume.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    });

    await expect(
      service.login({ email: 'parent@example.com', password: 'x', ip: '10.0.0.1' }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });

    // пароль не проверяется, если лимит исчерпан
    expect(passwords.verify).not.toHaveBeenCalled();
  });

  it('ограничивает частоту попыток по IP', async () => {
    rateLimiter.consume.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 30,
    });

    await expect(
      service.login({ email: 'parent@example.com', password: 'x', ip: '10.0.0.1' }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('проверяет и IP, и email', async () => {
    await service.login({ email: 'parent@example.com', password: 'x', ip: '10.0.0.1' });

    const keys = rateLimiter.consume.mock.calls.map(([key]) => key);
    expect(keys).toEqual(['auth:ip:10.0.0.1', 'auth:email:parent@example.com']);
  });

  it('ротирует refresh-токен и отдает новую сессию', async () => {
    refreshTokens.rotate.mockResolvedValue({
      userId: 'user-1',
      refresh: { token: 'refresh-2', expiresAt: new Date('2026-04-01T00:00:00.000Z') },
    });

    const session = await service.refresh('refresh-1');

    expect(session.refreshToken).toBe('refresh-2');
    expect(session.user).toBe(profile);
    expect(audit.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.token_refreshed' }),
    );
  });

  it('при обновлении ищет пользователя по id, а не по email', async () => {
    // Ротация возвращает идентификатор владельца токена. Если передать его в
    // поиск по email, пользователь не найдется и клиент получит 401.
    refreshTokens.rotate.mockResolvedValue({
      userId: 'user-1',
      refresh: { token: 'refresh-2', expiresAt: new Date() },
    });

    await service.refresh('refresh-1');

    expect(repository.findUserById).toHaveBeenCalledWith('user-1');
    expect(repository.findUserForAuth).not.toHaveBeenCalled();
  });

  it('ограничивает перебор refresh-токенов по IP', async () => {
    // Refresh-токен — секрет: без лимита его можно перебирать, а каждая попытка
    // еще и отзывает токены владельца при совпадении.
    rateLimiter.consume.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 60 });

    await expect(service.refresh('refresh-1', '10.0.0.1')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(refreshTokens.rotate).not.toHaveBeenCalled();

    // Ключ отдельный от входа: иначе вход и обновление сессии делили бы один
    // счетчик, и обычная работа выбивала бы пользователя из системы.
    expect(rateLimiter.consume).toHaveBeenCalledWith(
      'auth:refresh:ip:10.0.0.1',
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('без IP обновление не блокируется: лимит считается по адресу', async () => {
    refreshTokens.rotate.mockResolvedValue({
      userId: 'user-1',
      refresh: { token: 'refresh-2', expiresAt: new Date() },
    });

    await service.refresh('refresh-1');

    expect(rateLimiter.consume).not.toHaveBeenCalled();
    expect(refreshTokens.rotate).toHaveBeenCalled();
  });

  it('сообщает о повторном использовании refresh-токена', async () => {
    refreshTokens.rotate.mockRejectedValue(new ApiException('UNAUTHENTICATED', 'отозван'));

    await expect(service.refresh('refresh-reused')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(audit.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.token_reuse_detected' }),
    );
  });

  it('не пускает заблокированного пользователя по refresh-токену', async () => {
    refreshTokens.rotate.mockResolvedValue({
      userId: 'user-1',
      refresh: { token: 'refresh-2', expiresAt: new Date() },
    });
    repository.findUserById.mockResolvedValue({ ...activeUser, status: 'BLOCKED' });

    await expect(service.refresh('refresh-1')).rejects.toMatchObject({ code: 'USER_BLOCKED' });
  });

  it('отзывает refresh-токен при выходе', async () => {
    await service.logout('refresh-1');

    expect(refreshTokens.revoke).toHaveBeenCalledWith('refresh-1');
    expect(audit.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.logout' }),
    );
  });

  it('выход без токена не падает', async () => {
    await expect(service.logout(undefined)).resolves.toBeUndefined();
    expect(refreshTokens.revoke).not.toHaveBeenCalled();
  });
});
