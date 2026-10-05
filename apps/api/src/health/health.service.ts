import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppEnvironment } from '@octagon/config';
import { PrismaService } from '../prisma';

export interface LivenessReport {
  status: 'ok';
  service: string;
  environment: string;
  version: string;
  uptimeSeconds: number;
  clubTimezone: string;
  timestamp: string;
}

export interface ReadinessCheck {
  name: string;
  status: 'up' | 'down';
}

export interface ReadinessReport {
  status: 'ok' | 'degraded';
  checks: ReadinessCheck[];
  timestamp: string;
}

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {}

  liveness(): LivenessReport {
    return {
      status: 'ok',
      service: 'octagon-api',
      environment: this.config.get('NODE_ENV', { infer: true }),
      version: process.env.npm_package_version ?? '0.0.0',
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      clubTimezone: this.config.get('CLUB_TIMEZONE', { infer: true }),
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<ReadinessReport> {
    const databaseUp = await this.prisma.isReachable();
    const checks: ReadinessCheck[] = [
      { name: 'database', status: databaseUp ? 'up' : 'down' },
    ];

    return {
      status: checks.every((check) => check.status === 'up') ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
