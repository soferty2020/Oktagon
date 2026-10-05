import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { GroupsController } from './groups.controller';
import { GroupsRepository, PrismaGroupsRepository } from './groups.repository';
import { GroupsService } from './groups.service';

/**
 * Группы и связи (issues C6–C8).
 *
 * Спецификация: docs/22-erd.md (Group, GroupBranch, GroupTrainer,
 * GroupMembership), docs/00-project-overview.md (группа может заниматься в
 * нескольких филиалах).
 *
 * IdentityModule дает PermissionsGuard (`groups.view`, `groups.edit`) и
 * ResourceScopeService: список групп ограничивается зоной видимости.
 */
@Module({
  imports: [IdentityModule],
  controllers: [GroupsController],
  providers: [
    GroupsService,
    PrismaGroupsRepository,
    { provide: GroupsRepository, useExisting: PrismaGroupsRepository },
  ],
  exports: [GroupsService, GroupsRepository],
})
export class GroupsModule {}
