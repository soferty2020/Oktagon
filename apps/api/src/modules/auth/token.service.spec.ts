import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { TokenService } from './token.service';

const config = {
  get: (key: string) => {
    switch (key) {
      case 'JWT_ACCESS_SECRET':
        return 'test-access-secret-value-32-characters-long';
      case 'JWT_ACCESS_TTL_SECONDS':
        return 900;
      default:
        return undefined;
    }
  },
} as unknown as ConfigService<never, true>;

describe('TokenService', () => {
  const service = new TokenService(new JwtService({}), config);

  it('выпускает access-токен с полями sub, email, role', async () => {
    const issued = await service.issueAccessToken({
      sub: 'user-1',
      email: 'parent@example.com',
      role: 'MEMBER',
    });

    expect(issued.expiresIn).toBe(900);

    const payload = await service.verifyAccessToken(issued.token);
    expect(payload).toMatchObject({ sub: 'user-1', email: 'parent@example.com', role: 'MEMBER' });
  });

  it('кладет exp в токен (короткоживущий access по docs/15-security.md)', async () => {
    const issued = await service.issueAccessToken({ sub: 'user-1', email: 'a@b.c', role: 'STAFF' });
    const decoded = new JwtService({}).decode(issued.token) as { exp?: number; iat?: number };

    expect(decoded.exp).toBeDefined();
    expect(decoded.iat).toBeDefined();
    expect((decoded.exp ?? 0) - (decoded.iat ?? 0)).toBe(900);
  });

  it('не принимает токен, подписанный другим секретом', async () => {
    const foreign = await new JwtService({}).signAsync(
      { sub: 'user-1' },
      { secret: 'another-secret-value-32-characters-long', expiresIn: 900 },
    );

    await expect(service.verifyAccessToken(foreign)).rejects.toBeDefined();
  });

  it('не принимает испорченный токен', async () => {
    await expect(service.verifyAccessToken('not-a-jwt')).rejects.toBeDefined();
  });

  it('не принимает просроченный токен', async () => {
    const expired = await new JwtService({}).signAsync(
      { sub: 'user-1' },
      { secret: 'test-access-secret-value-32-characters-long', expiresIn: -10 },
    );

    await expect(service.verifyAccessToken(expired)).rejects.toBeDefined();
  });
});
