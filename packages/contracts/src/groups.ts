/**
 * Контракт групп (docs/22-erd.md: Group, GroupTrainer, GroupMembership).
 *
 * Группа живёт в одном зале (#65, ADR-0016): иерархия — зал → группы.
 */

import type { AthleteStatus } from './domain';

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
  /** Зал группы, если назначен. */
  hallId: string | null;
  hallName: string | null;
  activeMembersCount: number;
  createdAt: string;
  updatedAt: string;
}

/** `GET /groups/{id}` — группа с тренерами и составом. */
export interface GroupDetails extends GroupView {
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
  /** Зал, в котором занимается группа. */
  hallId?: string | null;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string | null;
  hallId?: string | null;
  isActive?: boolean;
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
