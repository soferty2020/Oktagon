import { Injectable } from '@nestjs/common';
import { AthleteStatus, MembershipState } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

export interface GroupRecord {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupBranchRecord {
  branchId: string;
  branchName: string;
  isPrimary: boolean;
}

export interface GroupTrainerRecord {
  trainerId: string;
  displayName: string;
  isPrimary: boolean;
  assignedAt: Date;
}

export interface GroupMemberRecord {
  athleteId: string;
  firstName: string;
  lastName: string;
  status: AthleteStatus;
  joinedAt: Date;
}

export interface GroupListQuery {
  isActive?: boolean;
  search?: string;
  /** Группы, видимые сотруднику; null — ограничений нет. */
  visibleGroupIds?: string[] | null;
}

export interface CreateGroupInput {
  name: string;
  description?: string | null;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

export interface ActiveMembershipRecord {
  membershipId: string;
  groupId: string;
  groupName: string;
  joinedAt: Date;
}

/**
 * Доступ к группам и связям.
 *
 * Абстрактный класс как DI-токен: сервис не зависит от Prisma и тестируется
 * без БД (docs/13-architecture.md).
 */
export abstract class GroupsRepository {
  abstract list(query: GroupListQuery): Promise<GroupRecord[]>;
  abstract find(id: string): Promise<GroupRecord | null>;
  abstract create(input: CreateGroupInput): Promise<GroupRecord>;
  abstract update(id: string, input: UpdateGroupInput): Promise<GroupRecord>;
  abstract archive(id: string, at: Date): Promise<void>;
  abstract countActiveMembers(groupId: string): Promise<number>;

  abstract listBranches(groupId: string): Promise<GroupBranchRecord[]>;
  abstract findBranchLink(groupId: string, branchId: string): Promise<GroupBranchRecord | null>;
  abstract linkBranch(input: {
    groupId: string;
    branchId: string;
    isPrimary: boolean;
  }): Promise<GroupBranchRecord>;
  /** Снимает признак основного филиала у остальных связей группы. */
  abstract clearPrimaryBranch(groupId: string): Promise<void>;
  abstract unlinkBranch(groupId: string, branchId: string): Promise<boolean>;
  abstract branchExists(branchId: string): Promise<boolean>;

  abstract listTrainers(groupId: string): Promise<GroupTrainerRecord[]>;
  abstract findActiveTrainer(
    groupId: string,
    trainerId: string,
  ): Promise<GroupTrainerRecord | null>;
  abstract assignTrainer(input: {
    groupId: string;
    trainerId: string;
    isPrimary: boolean;
  }): Promise<GroupTrainerRecord>;
  abstract clearPrimaryTrainer(groupId: string): Promise<void>;
  /** Освобождает активное назначение тренера (unassignedAt). */
  abstract unassignTrainer(groupId: string, trainerId: string): Promise<boolean>;
  abstract trainerExists(trainerId: string): Promise<boolean>;

  abstract listMembers(groupId: string): Promise<GroupMemberRecord[]>;
  abstract addMember(input: {
    groupId: string;
    athleteId: string;
    joinedAt: Date;
  }): Promise<GroupMemberRecord>;
  /** Действующее членство спортсмена (в любой группе). */
  abstract findActiveMembership(athleteId: string): Promise<ActiveMembershipRecord | null>;
  abstract findMembershipInGroup(groupId: string, athleteId: string): Promise<boolean>;
  /** Завершает членство: state = ENDED и leftAt. */
  abstract endMembership(groupId: string, athleteId: string, leftAt: Date): Promise<boolean>;
  abstract athleteExists(athleteId: string): Promise<boolean>;
  /** Есть ли активная группа: нужно модулю расписания для проверки ссылки. */
  abstract exists(groupId: string): Promise<boolean>;
  /** Основной филиал группы: занятие наследует его при материализации. */
  abstract findPrimaryBranchId(groupId: string): Promise<string | null>;
}

const GROUP_SELECT = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaGroupsRepository extends GroupsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(query: GroupListQuery): Promise<GroupRecord[]> {
    const search = query.search?.trim();
    const visible = query.visibleGroupIds;

    // Пустой список видимых групп означает «ничего не видно»: это не то же
    // самое, что null («ограничений нет»).
    if (visible && visible.length === 0) {
      return [];
    }

    return this.prisma.db.group.findMany({
      where: {
        archivedAt: null,
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
        ...(visible ? { id: { in: visible } } : {}),
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      select: GROUP_SELECT,
    });
  }

  async find(id: string): Promise<GroupRecord | null> {
    return this.prisma.db.group.findFirst({
      where: { id, archivedAt: null },
      select: GROUP_SELECT,
    });
  }

  async create(input: CreateGroupInput): Promise<GroupRecord> {
    return this.prisma.db.group.create({
      data: { name: input.name, description: input.description ?? null },
      select: GROUP_SELECT,
    });
  }

  async update(id: string, input: UpdateGroupInput): Promise<GroupRecord> {
    return this.prisma.db.group.update({ where: { id }, data: input, select: GROUP_SELECT });
  }

  async archive(id: string, at: Date): Promise<void> {
    await this.prisma.db.group.update({
      where: { id },
      data: { archivedAt: at, isActive: false },
    });
  }

  async countActiveMembers(groupId: string): Promise<number> {
    return this.prisma.db.groupMembership.count({
      where: { groupId, state: MembershipState.ACTIVE },
    });
  }

  async listBranches(groupId: string): Promise<GroupBranchRecord[]> {
    const links = await this.prisma.db.groupBranch.findMany({
      where: { groupId, branch: { archivedAt: null } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: { branchId: true, isPrimary: true, branch: { select: { name: true } } },
    });

    return links.map((link) => ({
      branchId: link.branchId,
      branchName: link.branch.name,
      isPrimary: link.isPrimary,
    }));
  }

  async findBranchLink(groupId: string, branchId: string): Promise<GroupBranchRecord | null> {
    const link = await this.prisma.db.groupBranch.findUnique({
      where: { groupId_branchId: { groupId, branchId } },
      select: { branchId: true, isPrimary: true, branch: { select: { name: true } } },
    });

    if (!link) {
      return null;
    }
    return { branchId: link.branchId, branchName: link.branch.name, isPrimary: link.isPrimary };
  }

  async linkBranch(input: {
    groupId: string;
    branchId: string;
    isPrimary: boolean;
  }): Promise<GroupBranchRecord> {
    const link = await this.prisma.db.groupBranch.upsert({
      where: { groupId_branchId: { groupId: input.groupId, branchId: input.branchId } },
      create: input,
      update: { isPrimary: input.isPrimary },
      select: { branchId: true, isPrimary: true, branch: { select: { name: true } } },
    });

    return { branchId: link.branchId, branchName: link.branch.name, isPrimary: link.isPrimary };
  }

  async clearPrimaryBranch(groupId: string): Promise<void> {
    await this.prisma.db.groupBranch.updateMany({
      where: { groupId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  async unlinkBranch(groupId: string, branchId: string): Promise<boolean> {
    const result = await this.prisma.db.groupBranch.deleteMany({ where: { groupId, branchId } });
    return result.count > 0;
  }

  async branchExists(branchId: string): Promise<boolean> {
    const branch = await this.prisma.db.branch.findFirst({
      where: { id: branchId, archivedAt: null },
      select: { id: true },
    });
    return branch !== null;
  }

  async listTrainers(groupId: string): Promise<GroupTrainerRecord[]> {
    const assignments = await this.prisma.db.groupTrainer.findMany({
      where: { groupId, unassignedAt: null, trainerProfile: { archivedAt: null } },
      orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'asc' }],
      select: {
        isPrimary: true,
        assignedAt: true,
        trainerProfile: { select: { id: true, displayName: true } },
      },
    });

    return assignments.map((assignment) => ({
      trainerId: assignment.trainerProfile.id,
      displayName: assignment.trainerProfile.displayName,
      isPrimary: assignment.isPrimary,
      assignedAt: assignment.assignedAt,
    }));
  }

  async findActiveTrainer(
    groupId: string,
    trainerId: string,
  ): Promise<GroupTrainerRecord | null> {
    const assignment = await this.prisma.db.groupTrainer.findFirst({
      where: { groupId, trainerProfileId: trainerId, unassignedAt: null },
      select: {
        isPrimary: true,
        assignedAt: true,
        trainerProfile: { select: { id: true, displayName: true } },
      },
    });

    if (!assignment) {
      return null;
    }
    return {
      trainerId: assignment.trainerProfile.id,
      displayName: assignment.trainerProfile.displayName,
      isPrimary: assignment.isPrimary,
      assignedAt: assignment.assignedAt,
    };
  }

  async assignTrainer(input: {
    groupId: string;
    trainerId: string;
    isPrimary: boolean;
  }): Promise<GroupTrainerRecord> {
    // Уникального ограничения на пару нет: повторное назначение после
    // освобождения создает новую запись истории, поэтому проверка выше.
    const assignment = await this.prisma.db.groupTrainer.create({
      data: { groupId: input.groupId, trainerProfileId: input.trainerId, isPrimary: input.isPrimary },
      select: {
        isPrimary: true,
        assignedAt: true,
        trainerProfile: { select: { id: true, displayName: true } },
      },
    });

    return {
      trainerId: assignment.trainerProfile.id,
      displayName: assignment.trainerProfile.displayName,
      isPrimary: assignment.isPrimary,
      assignedAt: assignment.assignedAt,
    };
  }

  async clearPrimaryTrainer(groupId: string): Promise<void> {
    await this.prisma.db.groupTrainer.updateMany({
      where: { groupId, isPrimary: true, unassignedAt: null },
      data: { isPrimary: false },
    });
  }

  async unassignTrainer(groupId: string, trainerId: string): Promise<boolean> {
    const result = await this.prisma.db.groupTrainer.updateMany({
      where: { groupId, trainerProfileId: trainerId, unassignedAt: null },
      data: { unassignedAt: new Date() },
    });
    return result.count > 0;
  }

  async trainerExists(trainerId: string): Promise<boolean> {
    const trainer = await this.prisma.db.trainerProfile.findFirst({
      where: { id: trainerId, archivedAt: null },
      select: { id: true },
    });
    return trainer !== null;
  }

  async listMembers(groupId: string): Promise<GroupMemberRecord[]> {
    const memberships = await this.prisma.db.groupMembership.findMany({
      where: { groupId, state: MembershipState.ACTIVE, athlete: { archivedAt: null } },
      orderBy: [{ joinedAt: 'asc' }],
      select: {
        joinedAt: true,
        athlete: {
          select: { id: true, firstName: true, lastName: true, status: true },
        },
      },
    });

    return memberships.map((membership) => ({
      athleteId: membership.athlete.id,
      firstName: membership.athlete.firstName,
      lastName: membership.athlete.lastName,
      status: membership.athlete.status,
      joinedAt: membership.joinedAt,
    }));
  }

  async addMember(input: {
    groupId: string;
    athleteId: string;
    joinedAt: Date;
  }): Promise<GroupMemberRecord> {
    const membership = await this.prisma.db.groupMembership.create({
      data: {
        groupId: input.groupId,
        athleteId: input.athleteId,
        joinedAt: input.joinedAt,
        state: MembershipState.ACTIVE,
      },
      select: {
        joinedAt: true,
        athlete: { select: { id: true, firstName: true, lastName: true, status: true } },
      },
    });

    return {
      athleteId: membership.athlete.id,
      firstName: membership.athlete.firstName,
      lastName: membership.athlete.lastName,
      status: membership.athlete.status,
      joinedAt: membership.joinedAt,
    };
  }

  async findActiveMembership(athleteId: string): Promise<ActiveMembershipRecord | null> {
    const membership = await this.prisma.db.groupMembership.findFirst({
      where: { athleteId, state: MembershipState.ACTIVE },
      select: {
        id: true,
        joinedAt: true,
        groupId: true,
        group: { select: { name: true } },
      },
    });

    if (!membership) {
      return null;
    }
    return {
      membershipId: membership.id,
      groupId: membership.groupId,
      groupName: membership.group.name,
      joinedAt: membership.joinedAt,
    };
  }

  async findMembershipInGroup(groupId: string, athleteId: string): Promise<boolean> {
    const membership = await this.prisma.db.groupMembership.findFirst({
      where: { groupId, athleteId, state: MembershipState.ACTIVE },
      select: { id: true },
    });
    return membership !== null;
  }

  async endMembership(groupId: string, athleteId: string, leftAt: Date): Promise<boolean> {
    const result = await this.prisma.db.groupMembership.updateMany({
      where: { groupId, athleteId, state: MembershipState.ACTIVE },
      data: { state: MembershipState.ENDED, leftAt },
    });
    return result.count > 0;
  }

  async athleteExists(athleteId: string): Promise<boolean> {
    const athlete = await this.prisma.db.athlete.findFirst({
      where: { id: athleteId, archivedAt: null },
      select: { id: true },
    });
    return athlete !== null;
  }

  async exists(groupId: string): Promise<boolean> {
    const group = await this.prisma.db.group.findFirst({
      where: { id: groupId, archivedAt: null },
      select: { id: true },
    });
    return group !== null;
  }

  async findPrimaryBranchId(groupId: string): Promise<string | null> {
    const link = await this.prisma.db.groupBranch.findFirst({
      where: { groupId, isPrimary: true, branch: { archivedAt: null } },
      select: { branchId: true },
    });
    return link?.branchId ?? null;
  }
}
