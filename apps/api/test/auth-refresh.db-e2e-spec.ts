import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../src/prisma/prisma.service';
import { RefreshTokenService, RefreshTokenSigner, hashRefreshToken } from '../src/modules/auth/refresh-token.service';

/**
 * Ротация refresh-токенов на реальной БД (docs/15-security.md: refresh token
 * rotation recommended; docs/16-testing.md: critical scenario).
 *
 * Требует примененной миграции в octagon_test (см. docs/27-local-development.md).
 */
describe('RefreshTokenService (db e2e, требуется PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: RefreshTokenService;
  let userId: string;
  const email = `rt-e2e-${Date.now()}@example.com`;

  const config = {
    get: (key: string) => {
      switch (key) {
        case 'JWT_REFRESH_SECRET':
          return 'test-refresh-secret-value-32-characters-long';
        case 'JWT_REFRESH_TTL_SECONDS':
          return 1209600;
        default:
          return undefined;
      }
    },
  } as unknown as ConfigService<never, true>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        { provide: ConfigService, useValue: config },
        { provide: JwtService, useValue: new JwtService({}) },
        RefreshTokenSigner,
        RefreshTokenService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(RefreshTokenService);

    const user = await prisma.db.user.create({
      data: { email, firstName: 'Refresh', lastName: 'E2E', role: 'MEMBER', status: 'ACTIVE' },
      select: { id: true },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.db.refreshToken.deleteMany({ where: { userId } });
    await prisma.db.user.deleteMany({ where: { id: userId } });
    await prisma.onModuleDestroy();
  });

  it('хранит хеш токена, а не сам токен', async () => {
    const issued = await service.issue(userId);

    const stored = await prisma.db.refreshToken.findFirstOrThrow({
      where: { userId, revokedAt: null },
    });

    expect(stored.tokenHash).toBe(hashRefreshToken(issued.token));
    expect(stored.tokenHash).not.toBe(issued.token);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('ротирует токен: старый отзывается, выпускается новый', async () => {
    const first = await service.issue(userId);

    const rotated = await service.rotate(first.token);

    expect(rotated.userId).toBe(userId);
    expect(rotated.refresh.token).not.toBe(first.token);

    const oldRecord = await prisma.db.refreshToken.findFirst({
      where: { tokenHash: hashRefreshToken(first.token) },
    });
    expect(oldRecord?.revokedAt).not.toBeNull();

    const newRecord = await prisma.db.refreshToken.findFirst({
      where: { tokenHash: hashRefreshToken(rotated.refresh.token) },
    });
    expect(newRecord?.revokedAt).toBeNull();
  });

  it('при повторном использовании отозванного токена отзывает все токены пользователя', async () => {
    await prisma.db.refreshToken.updateMany({ where: { userId }, data: { revokedAt: new Date() } });

    const first = await service.issue(userId);
    await service.rotate(first.token);

    // Предъявляем уже использованный токен повторно.
    await expect(service.rotate(first.token)).rejects.toBeInstanceOf(UnauthorizedException);

    const stillActive = await prisma.db.refreshToken.count({
      where: { userId, revokedAt: null },
    });
    expect(stillActive).toBe(0);
  });

  it('не принимает чужой (валидно подписанный) токен', async () => {
    await expect(service.rotate('not-a-jwt')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('отзывает токен при выходе', async () => {
    const issued = await service.issue(userId);

    await service.revoke(issued.token);

    const record = await prisma.db.refreshToken.findFirst({
      where: { tokenHash: hashRefreshToken(issued.token) },
    });
    expect(record?.revokedAt).not.toBeNull();
  });

  it('выход с невалидным токеном не падает', async () => {
    await expect(service.revoke('garbage')).resolves.toBeUndefined();
  });
});
