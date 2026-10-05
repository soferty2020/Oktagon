import { Module } from '@nestjs/common';

import { PermissionResolver, PermissionsGuard } from '../../shared/permissions.guard';
import { IdentityController } from './identity.controller';
import { IdentityRepository, PrismaIdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';
import { PermissionGrantService } from './permission-grant.service';
import { ResourceScopeService } from './resource-scope.service';
import { UserPermissionsController } from './user-permissions.controller';
import { UsersController } from './users.controller';

/**
 * Модуль identity (issues B1, B5, B6, K2).
 *
 * Спецификация: docs/04-roles-permissions.md, docs/21-permission-matrix.md,
 * docs/22-erd.md (User, Permission, UserPermission, UserInvite),
 * ADR-0006, ADR-0007.
 *
 * Здесь же живут проверка прав (PermissionsGuard) и ресурсный scope
 * (ResourceScopeService): это части identity, а IdentityService выступает
 * источником эффективных прав для guard-а.
 */
@Module({
  controllers: [IdentityController, UserPermissionsController, UsersController],
  providers: [
    IdentityService,
    PermissionGrantService,
    ResourceScopeService,
    PrismaIdentityRepository,
    { provide: IdentityRepository, useExisting: PrismaIdentityRepository },
    { provide: PermissionResolver, useExisting: IdentityService },
    PermissionsGuard,
  ],
  // PermissionsGuard резолвится в модулях-потребителях, поэтому вместе с ним
  // экспортируется и его зависимость — токен PermissionResolver.
  // ResourceScopeService экспортируется для доменных модулей: наличие права не
  // заменяет проверку scope (docs/21-permission-matrix.md).
  exports: [
    IdentityService,
    PermissionGrantService,
    ResourceScopeService,
    PermissionsGuard,
    PermissionResolver,
  ],
})
export class IdentityModule {}
