/**
 * Контракт структуры клуба: филиалы, залы, тренеры
 * (docs/00-project-overview.md, docs/22-erd.md).
 */

/** `GET /api/v1/branches`. */
export interface BranchView {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** `GET /api/v1/branches/{id}` — филиал вместе с залами. */
export interface BranchDetails extends BranchView {
  halls: HallView[];
}

export interface HallView {
  id: string;
  branchId: string;
  name: string;
  capacity: number | null;
  isActive: boolean;
}

/** `GET /api/v1/trainers`. */
export interface TrainerView {
  id: string;
  /** Аккаунт тренера, если он может входить в систему. */
  userId: string | null;
  displayName: string;
  phone: string | null;
  bio: string | null;
  isActive: boolean;
}

export interface CreateBranchInput {
  name: string;
  address?: string | null;
  phone?: string | null;
}

export interface UpdateBranchInput {
  name?: string;
  address?: string | null;
  phone?: string | null;
  isActive?: boolean;
}

export interface CreateHallInput {
  branchId: string;
  name: string;
  capacity?: number | null;
}

export interface UpdateHallInput {
  name?: string;
  capacity?: number | null;
  isActive?: boolean;
}

export interface CreateTrainerInput {
  displayName: string;
  phone?: string | null;
  bio?: string | null;
  /** Существующий аккаунт: логин тренеру не обязателен (docs/04-roles-permissions.md). */
  userId?: string | null;
}

export interface UpdateTrainerInput {
  displayName?: string;
  phone?: string | null;
  bio?: string | null;
  isActive?: boolean;
}

/**
 * Права, которыми управляются справочники клуба.
 *
 * В `docs/04-roles-permissions.md` нет отдельных прав для тренеров, поэтому
 * изменение профиля тренера опирается на `users.manage` и `branches.manage`:
 * профиль тренера связан с аккаунтом и расписанием. Это решение зафиксировано
 * в docs/26-implementation-foundation.md и требует подтверждения в ADR, если
 * появится отдельная роль администратора клуба.
 */
export const TRAINER_MANAGE_PERMISSIONS = ['users.manage', 'branches.manage'] as const;
