import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  type ActiveMembershipView,
  type AddGroupMemberInput,
  type AssignGroupTrainerInput,
  type CreateGroupInput,
  type GroupDetails,
  type GroupMemberView,
  type GroupTrainerView,
  type GroupView,
  type UpdateGroupInput,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { ResourceScopeService } from '../identity/resource-scope.service';
// Обычный импорт, не `import type`: GroupsRepository — DI-токен, его значение
// должно попасть в метаданные конструктора (emitDecoratorMetadata).
import { GroupsRepository } from './groups.repository';
import type {
  ActiveMembershipRecord,
  GroupMemberRecord,
  GroupRecord,
  GroupTrainerRecord,
} from './groups.repository';

/**
 * Группы и связи: филиалы, тренеры, состав (issues C6–C8).
 *
 * Спецификация: docs/22-erd.md (Group, GroupBranch, GroupTrainer,
 * GroupMembership), docs/00-project-overview.md (группа может заниматься в
 * нескольких филиалах), docs/08-database.md (одна активная GroupMembership на
 * спортсмена), BR-007 (аудит).
 *
 * Список групп ограничен scope: тренер видит только свои группы
 * (docs/21-permission-matrix.md, Enforcement).
 */
@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    private readonly groups: GroupsRepository,
    private readonly scope: ResourceScopeService,
    private readonly audit: AuditService,
  ) {}

  // --- Группы --------------------------------------------------------------

  async list(
    callerUserId: string,
    options: { isActive?: boolean; search?: string } = {},
  ): Promise<GroupView[]> {
    const visibleGroupIds = await this.scope.visibleGroupIds(callerUserId);
    const groups = await this.groups.list({
      isActive: options.isActive,
      search: options.search,
      visibleGroupIds,
    });

    return Promise.all(groups.map((group) => this.toGroupView(group)));
  }

  async get(callerUserId: string, groupId: string): Promise<GroupDetails> {
    await this.scope.assertGroupAccess(callerUserId, groupId);

    const group = await this.requireGroup(groupId);
    const [trainers, members] = await Promise.all([
      this.groups.listTrainers(groupId),
      this.groups.listMembers(groupId),
    ]);

    return {
      ...(await this.toGroupView(group)),
      trainers: trainers.map(toTrainerView),
      members: members.map(toMemberView),
    };
  }

  async create(input: CreateGroupInput): Promise<GroupView> {
    const group = await this.groups.create(input);

    await this.audit.recordSafely({
      action: AuditAction.GROUP_CREATED,
      entityType: AuditEntityType.GROUP,
      entityId: group.id,
      after: { name: group.name },
    });

    return this.toGroupView(group);
  }

  async update(
    callerUserId: string,
    groupId: string,
    input: UpdateGroupInput,
  ): Promise<GroupDetails> {
    await this.scope.assertGroupAccess(callerUserId, groupId);

    const before = await this.requireGroup(groupId);
    await this.groups.update(groupId, input);

    await this.audit.recordSafely({
      action: AuditAction.GROUP_UPDATED,
      entityType: AuditEntityType.GROUP,
      entityId: groupId,
      before: { name: before.name, isActive: before.isActive },
      after: { name: input.name ?? before.name, isActive: input.isActive ?? before.isActive },
    });

    return this.get(callerUserId, groupId);
  }

  async archive(callerUserId: string, groupId: string): Promise<void> {
    await this.scope.assertGroupAccess(callerUserId, groupId);

    const group = await this.requireGroup(groupId);
    await this.groups.archive(groupId, new Date());

    await this.audit.recordSafely({
      action: AuditAction.GROUP_ARCHIVED,
      entityType: AuditEntityType.GROUP,
      entityId: groupId,
      before: { name: group.name },
    });
  }

  // --- Филиалы группы (C7) -------------------------------------------------

  /**
   * Привязывает филиал к группе.
   *
   * Группа может заниматься в нескольких филиалах
   * (docs/00-project-overview.md), поэтому связь many-to-many; «основным»
   * помечается только один филиал.
   */


  // --- Тренеры группы (C7) -------------------------------------------------

  /**
   * Назначает тренера на группу.
   *
   * Повторное назначение активного тренера отклоняется: история назначений
   * хранится, поэтому дубликат создал бы две действующие записи.
   */
  async assignTrainer(
    callerUserId: string,
    groupId: string,
    input: AssignGroupTrainerInput,
  ): Promise<GroupDetails> {
    await this.scope.assertGroupAccess(callerUserId, groupId);
    await this.requireGroup(groupId);

    if (!(await this.groups.trainerExists(input.trainerId))) {
      throw new ApiException('TRAINER_NOT_FOUND' satisfies ApiErrorCode, 'Тренер не найден', {
        trainerId: input.trainerId,
      });
    }

    if (await this.groups.findActiveTrainer(groupId, input.trainerId)) {
      throw new ApiException(
        'GROUP_TRAINER_ALREADY_ASSIGNED' satisfies ApiErrorCode,
        'Тренер уже ведет эту группу',
      );
    }

    const isPrimary = input.isPrimary ?? false;
    if (isPrimary) {
      await this.groups.clearPrimaryTrainer(groupId);
    }
    await this.groups.assignTrainer({ groupId, trainerId: input.trainerId, isPrimary });

    await this.audit.recordSafely({
      action: AuditAction.GROUP_TRAINER_ASSIGNED,
      entityType: AuditEntityType.GROUP_TRAINER,
      entityId: groupId,
      after: { trainerId: input.trainerId, isPrimary },
    });

    return this.get(callerUserId, groupId);
  }

  async unassignTrainer(
    callerUserId: string,
    groupId: string,
    trainerId: string,
  ): Promise<GroupDetails> {
    await this.scope.assertGroupAccess(callerUserId, groupId);

    if (!(await this.groups.unassignTrainer(groupId, trainerId))) {
      throw new ApiException(
        'GROUP_TRAINER_NOT_ASSIGNED' satisfies ApiErrorCode,
        'Тренер не назначен на эту группу',
      );
    }

    await this.audit.recordSafely({
      action: AuditAction.GROUP_TRAINER_UNASSIGNED,
      entityType: AuditEntityType.GROUP_TRAINER,
      entityId: groupId,
      before: { trainerId },
    });

    return this.get(callerUserId, groupId);
  }

  // --- Состав группы (C8) --------------------------------------------------

  /**
   * Добавляет спортсмена в группу.
   *
   * По docs/08-database.md у спортсмена допускается одна активная
   * GroupMembership: частичный уникальный индекс в БД это гарантирует, а здесь
   * мы даем понятную ошибку с указанием текущей группы.
   */
  async addMember(
    callerUserId: string,
    groupId: string,
    input: AddGroupMemberInput,
  ): Promise<GroupDetails> {
    await this.scope.assertGroupAccess(callerUserId, groupId);

    const group = await this.requireGroup(groupId);
    this.assertGroupActive(group);

    if (!(await this.groups.athleteExists(input.athleteId))) {
      throw new ApiException('ATHLETE_NOT_FOUND' satisfies ApiErrorCode, 'Спортсмен не найден', {
        athleteId: input.athleteId,
      });
    }

    if (await this.groups.findMembershipInGroup(groupId, input.athleteId)) {
      throw new ApiException(
        'ATHLETE_ALREADY_MEMBER' satisfies ApiErrorCode,
        'Спортсмен уже состоит в этой группе',
      );
    }

    const active = await this.groups.findActiveMembership(input.athleteId);
    if (active) {
      throw new ApiException(
        'ACTIVE_MEMBERSHIP_EXISTS' satisfies ApiErrorCode,
        'У спортсмена уже есть активная группа: сначала завершите текущее членство',
        { currentGroupId: active.groupId, currentGroupName: active.groupName },
      );
    }

    await this.groups.addMember({
      groupId,
      athleteId: input.athleteId,
      joinedAt: input.joinedAt ? new Date(input.joinedAt) : new Date(),
    });

    await this.audit.recordSafely({
      action: AuditAction.GROUP_MEMBERSHIP_ADDED,
      entityType: AuditEntityType.GROUP_MEMBERSHIP,
      entityId: groupId,
      after: { athleteId: input.athleteId },
    });

    return this.get(callerUserId, groupId);
  }

  /** Завершает членство: запись сохраняется в истории со state = ENDED. */
  async endMembership(
    callerUserId: string,
    groupId: string,
    athleteId: string,
  ): Promise<GroupDetails> {
    await this.scope.assertGroupAccess(callerUserId, groupId);

    if (!(await this.groups.endMembership(groupId, athleteId, new Date()))) {
      throw new ApiException(
        'MEMBERSHIP_NOT_FOUND' satisfies ApiErrorCode,
        'Активное членство спортсмена в этой группе не найдено',
      );
    }

    await this.audit.recordSafely({
      action: AuditAction.GROUP_MEMBERSHIP_ENDED,
      entityType: AuditEntityType.GROUP_MEMBERSHIP,
      entityId: groupId,
      before: { athleteId },
    });

    return this.get(callerUserId, groupId);
  }

  /** Действующая группа спортсмена: нужна админке при переводе между группами. */
  async getActiveMembership(athleteId: string): Promise<ActiveMembershipView | null> {
    const active = await this.groups.findActiveMembership(athleteId);
    return active ? toActiveMembershipView(active) : null;
  }

  // --- Вспомогательное -----------------------------------------------------

  private async requireGroup(groupId: string): Promise<GroupRecord> {
    const group = await this.groups.find(groupId);
    if (!group) {
      throw new ApiException('GROUP_NOT_FOUND' satisfies ApiErrorCode, 'Группа не найдена');
    }
    return group;
  }

  private assertGroupActive(group: GroupRecord): void {
    if (!group.isActive) {
      throw new ApiException(
        'GROUP_ARCHIVED' satisfies ApiErrorCode,
        'Группа неактивна: сначала включите ее',
      );
    }
  }

  private async toGroupView(group: GroupRecord): Promise<GroupView> {
    const membersCount = await this.groups.countActiveMembers(group.id);

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      isActive: group.isActive,
      hallId: group.hallId,
      hallName: group.hall?.name ?? null,
      activeMembersCount: membersCount,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    };
  }
}


function toTrainerView(trainer: GroupTrainerRecord): GroupTrainerView {
  return {
    trainerId: trainer.trainerId,
    displayName: trainer.displayName,
    isPrimary: trainer.isPrimary,
    assignedAt: trainer.assignedAt.toISOString(),
  };
}

function toMemberView(member: GroupMemberRecord): GroupMemberView {
  return {
    athleteId: member.athleteId,
    firstName: member.firstName,
    lastName: member.lastName,
    status: member.status,
    joinedAt: member.joinedAt.toISOString().slice(0, 10),
  };
}

function toActiveMembershipView(membership: ActiveMembershipRecord): ActiveMembershipView {
  return {
    membershipId: membership.membershipId,
    groupId: membership.groupId,
    groupName: membership.groupName,
    joinedAt: membership.joinedAt.toISOString().slice(0, 10),
  };
}
