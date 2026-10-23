import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { RequestContextService } from '../../shared/request-context.service';
import { IdentityModule } from '../identity/identity.module';
import { AuditContextInterceptor } from './audit-context.interceptor';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/**
 * Аудит (BR-007, docs/08-database.md, docs/26-admin-settings.md).
 *
 * Модуль глобальный: аудит нужен всем доменным модулям, начиная с identity.
 * Интерсептор наполняет контекст запроса (requestId, IP, user-agent), который
 * AuditService читает при записи.
 *
 * `IdentityModule` импортируется ради `SuperadminGuard` у просмотра журнала: роль
 * читается через `PermissionResolver`. Цикла нет: IdentityModule не импортирует
 * AuditModule — тот глобальный.
 */
@Global()
@Module({
  imports: [IdentityModule],
  controllers: [AuditController],
  providers: [
    RequestContextService,
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditContextInterceptor },
  ],
  exports: [AuditService, RequestContextService],
})
export class AuditModule {}
