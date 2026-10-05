import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma';
import { RedisService } from '../redis';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  const isReachable = jest.fn<Promise<boolean>, []>();
  const redisReachable = jest.fn<Promise<boolean>, []>();
  let redisConfigured = true;

  beforeEach(async () => {
    redisConfigured = true;

    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: { isReachable } },
        {
          provide: RedisService,
          useValue: {
            isReachable: redisReachable,
            get isConfigured() {
              return redisConfigured;
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'NODE_ENV' ? 'test' : 'Asia/Almaty'),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(HealthService);
  });

  it('reports liveness with the club time zone from configuration', () => {
    const report = service.liveness();

    expect(report.status).toBe('ok');
    expect(report.environment).toBe('test');
    expect(report.clubTimezone).toBe('Asia/Almaty');
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('is ready when PostgreSQL responds', async () => {
    isReachable.mockResolvedValue(true);
    redisReachable.mockResolvedValue(true);

    const report = await service.readiness();

    expect(report.status).toBe('ok');
    expect(report.checks).toEqual([
      { name: 'database', status: 'up' },
      { name: 'redis', status: 'up' },
    ]);
  });

  it('is degraded when PostgreSQL is unreachable', async () => {
    isReachable.mockResolvedValue(false);
    redisReachable.mockResolvedValue(true);

    const report = await service.readiness();

    expect(report.status).toBe('degraded');
    expect(report.checks).toContainEqual({ name: 'database', status: 'down' });
  });

  it('is degraded when Redis is configured but unreachable', async () => {
    isReachable.mockResolvedValue(true);
    redisReachable.mockResolvedValue(false);

    const report = await service.readiness();

    expect(report.status).toBe('degraded');
    expect(report.checks).toContainEqual({ name: 'redis', status: 'down' });
  });

  it('не проверяет Redis, если REDIS_URL не задан', async () => {
    redisConfigured = false;
    isReachable.mockResolvedValue(true);

    const report = await service.readiness();

    expect(report.status).toBe('ok');
    expect(report.checks).toEqual([{ name: 'database', status: 'up' }]);
  });
});
