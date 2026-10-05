import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { RequestContextService } from '../../shared/request-context.service';
import { AuditContextInterceptor } from './audit-context.interceptor';
import { AuditService } from './audit.service';

/**
 * Аудит (BR-007, docs/08-database.md).
 *
 * Модуль глобальный: аудит нужен всем доменным модулям, начиная с identity.
 * Интерсептор наполняет контекст запроса (requestId, IP, user-agent), который
 * AuditService читает при записи.
 */
@Global()
@Module({
  providers: [
    RequestContextService,
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditContextInterceptor },
  ],
  exports: [AuditService, RequestContextService],
})
export class AuditModule {}
