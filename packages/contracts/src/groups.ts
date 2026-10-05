/**
 * Контракт групп (docs/22-erd.md: Group, GroupBranch, GroupTrainer,
 * GroupMembership; docs/00-project-overview.md: группа может заниматься в
 * нескольких филиалах).
 */

import type { AthleteStatus } from './domain';

/** Филиал, в котором занимается группа. */
export interface GroupBranchView {
  branchId: string;
  branchName: string;
  /** Основной филиал группы. */
  isPrimary: boolean;
}

/** Тренер, ведущий группу. */
export interface GroupTrainerView {
  trainerId: string;
  displayName: string;
  isPrimary: boolean;
  assignedAt: string;
}

export interface GroupView {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  /** Основной филиал, если он назначен. */
  primaryBranchName: string | null;
  activeMembersCount: number;
  createdAt: string;
  updatedAt: string;
}

/** `GET /groups/{id}` — группа с филиалами, тренерами и составом. */
export interface GroupDetails extends GroupView {
  branches: GroupBranchView[];
  trainers: GroupTrainerView[];
  members: GroupMemberView[];
}

export interface GroupMemberView {
  athleteId: string;
  firstName: string;
  lastName: string;
  status: AthleteStatus;
  joinedAt: string;
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

export interface AssignGroupBranchInput {
  branchId: string;
  isPrimary?: boolean;
}

export interface AssignGroupTrainerInput {
  /** Идентификатор профиля тренера (TrainerProfile), не аккаунта. */
  trainerId: string;
  isPrimary?: boolean;
}

export interface AddGroupMemberInput {
  athleteId: string;
  /** Календарная дата вступления (YYYY-MM-DD); по умолчанию сегодня. */
  joinedAt?: string | null;
}

/** Активная запись членства спортсмена. */
export interface ActiveMembershipView {
  membershipId: string;
  groupId: string;
  groupName: string;
  joinedAt: string;
}
