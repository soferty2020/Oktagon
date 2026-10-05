import { Injectable } from '@nestjs/common';

/**
 * Заготовка модуля groups.
 *
 * Спецификация: docs/22-erd.md (Group, GroupTrainer, GroupMembership), docs/08-database.md (одна активная GroupMembership на спортсмена).
 * Публичный контракт модуля согласуется до реализации
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Injectable()
export class GroupsService {}
