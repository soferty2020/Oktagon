import { Module } from '@nestjs/common';

import { AuditService } from './audit.service';

/**
 * Модуль audit.
 *
 * Спецификация: BR-007, docs/08-database.md (AuditLog), docs/15-security.md.
 * Публичный контракт и бизнес-логика добавляются отдельным issue
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
