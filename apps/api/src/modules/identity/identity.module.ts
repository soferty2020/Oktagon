import { Module } from '@nestjs/common';

import { PermissionResolver, PermissionsGuard } from '../../shared/permissions.guard';
import { IdentityController } from './identity.controller';
import { IdentityRepository, PrismaIdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';

/**
 * Модуль identity (issue B1).
 *
 * Спецификация: docs/04-roles-permissions.md, docs/21-permission-matrix.md,
 * docs/22-erd.md (User, Permission, UserPermission, UserInvite), ADR-0006, ADR-0007.
 *
 * Здесь же живет PermissionsGuard: проверка прав — часть identity, а
 * IdentityService выступает источником эффективных прав для guard-а.
 */
@Module({
  controllers: [IdentityController],
  providers: [
    IdentityService,
    PrismaIdentityRepository,
    { provide: IdentityRepository, useExisting: PrismaIdentityRepository },
    { provide: PermissionResolver, useExisting: IdentityService },
    PermissionsGuard,
  ],
  // PermissionsGuard резолвится в модулях-потребителях, поэтому вместе с ним
  // экспортируется и его зависимость — токен PermissionResolver.
  exports: [IdentityService, PermissionsGuard, PermissionResolver],
})
export class IdentityModule {}
