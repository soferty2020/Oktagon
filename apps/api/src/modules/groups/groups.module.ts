import { Module } from '@nestjs/common';

import { GroupsService } from './groups.service';

/**
 * Модуль groups.
 *
 * Спецификация: docs/22-erd.md (Group, GroupTrainer, GroupMembership), docs/08-database.md (одна активная GroupMembership на спортсмена).
 * Публичный контракт и бизнес-логика добавляются отдельным issue
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Module({
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
