import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma';
import { RedisModule } from './redis';
import { TokenModule } from './shared/token.module';
import { AnalyticsModule } from './modules/analytics';
import { AthletesModule } from './modules/athletes';
import { AttendanceModule } from './modules/attendance';
import { AuditModule } from './modules/audit';
import { AuthModule } from './modules/auth';
import { ChatModule } from './modules/chat';
import { ClubStructureModule } from './modules/club-structure';
import { FinanceModule } from './modules/finance';
import { FreezesModule } from './modules/freezes';
import { GroupsModule } from './modules/groups';
import { IdentityModule } from './modules/identity';
import { NewsModule } from './modules/news';
import { SchedulingModule } from './modules/scheduling';

/**
 * Корневой модуль API: модульный монолит (docs/13-architecture.md, ADR-0001).
 *
 * Состав модулей соответствует docs/13-architecture.md. Порядок внедрения —
 * docs/24-multi-agent-plan.md (Foundation -> identity/core -> schedule ->
 * attendance/finance -> communication -> clients -> stabilization).
 */
@Module({
  imports: [
    // Foundation
    AppConfigModule,
    PrismaModule,
    RedisModule,
    TokenModule,
    HealthModule,
    AuditModule,

    // Identity / core
    AuthModule,
    IdentityModule,
    AthletesModule,
    ClubStructureModule,
    GroupsModule,

    // Operations
    SchedulingModule,
    AttendanceModule,

    // Finance
    FinanceModule,
    FreezesModule,

    // Communication
    NewsModule,
    ChatModule,

    // Analytics
    AnalyticsModule,
  ],
})
export class AppModule {}
