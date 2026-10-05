import { Module } from '@nestjs/common';

import { IdentityService } from './identity.service';

/**
 * Модуль identity.
 *
 * Спецификация: docs/04-roles-permissions.md, docs/21-permission-matrix.md, docs/22-erd.md (User, Permission, UserPermission, UserInvite).
 * Публичный контракт и бизнес-логика добавляются отдельным issue
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Module({
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
