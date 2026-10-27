import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma';
import { RedisModule } from './redis';
import { RequestContextService, RequestIdInterceptor } from './shared';
import { TokenModule } from './shared/token.module';
import { AnalyticsModule } from './modules/analytics';
import { AthletesModule } from './modules/athletes';
import { AttestationsModule } from './modules/attestations/attestations.module';
import { CompetitionsModule } from './modules/competitions/competitions.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { TrialRequestsModule } from './modules/trial-requests/trial-requests.module';
import { AttendanceModule } from './modules/attendance';
import { AuditContextInterceptor } from './modules/audit/audit-context.interceptor';
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
import { SettingsModule } from './modules/settings';

/**
 * Корневой модуль API: модульный монолит (docs/13-architecture.md, ADR-0001).
 *
 * Состав модулей соответствует docs/13-architecture.md. Порядок внедрения —
 * docs/24-multi-agent-plan.md (Foundation -> identity/core -> schedule ->
 * attendance/finance -> communication -> clients -> stabilization).
 *
 * Интерсепторы регистрируются через `APP_INTERCEPTOR`, а не
 * `app.useGlobalInterceptors`: контексту запроса нужен DI, и без него
 * `AuditContextInterceptor` не создавался — audit log писался без автора.
 *
 * Порядок регистрации задает порядок выполнения: requestId должен появиться до
 * того, как откроется контекст, иначе в аудит попадал бы пустой идентификатор.
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
    AttestationsModule,
    CompetitionsModule,
    TrialRequestsModule,
    OnboardingModule,
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

    // Settings (docs/26-admin-settings.md)
    SettingsModule,

    // Analytics
    AnalyticsModule,
  ],
  providers: [
    RequestContextService,
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditContextInterceptor },
  ],
})
export class AppModule {}
