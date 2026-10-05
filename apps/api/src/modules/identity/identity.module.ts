import { Module } from '@nestjs/common';

import { IdentityController } from './identity.controller';
import { IdentityRepository, PrismaIdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';

/**
 * Модуль identity (issue B1).
 *
 * Спецификация: docs/04-roles-permissions.md, docs/21-permission-matrix.md,
 * docs/22-erd.md (User, Permission, UserPermission, UserInvite), ADR-0006, ADR-0007.
 *
 * Предоставляет профиль и эффективные права. Guards для permission-проверок
 * появятся в B5/B6 и будут опираться на IdentityService.
 */
@Module({
  controllers: [IdentityController],
  providers: [
    IdentityService,
    PrismaIdentityRepository,
    { provide: IdentityRepository, useExisting: PrismaIdentityRepository },
  ],
  exports: [IdentityService],
})
export class IdentityModule {}
