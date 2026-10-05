import { Injectable } from '@nestjs/common';

/**
 * Заготовка модуля audit.
 *
 * Спецификация: BR-007, docs/08-database.md (AuditLog), docs/15-security.md.
 * Публичный контракт модуля согласуется до реализации
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Injectable()
export class AuditService {}
