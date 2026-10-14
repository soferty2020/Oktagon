import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  type BranchDetails,
  type BranchView,
  type CreateBranchInput,
  type CreateHallInput,
  type CreateTrainerInput,
  type HallView,
  type TrainerView,
  type UpdateBranchInput,
  type UpdateHallInput,
  type UpdateTrainerInput,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { UserRole, UserStatus } from '../../../generated/prisma';
// Обычный импорт, не `import type`: ClubStructureRepository — DI-токен, его
// значение должно попасть в метаданные конструктора (emitDecoratorMetadata).
import { ClubStructureRepository } from './club-structure.repository';
import type { BranchRecord, HallRecord, TrainerRecord } from './club-structure.repository';

/**
 * Структура клуба: филиалы, залы, тренеры (issues C1–C3).
 *
 * Спецификация: docs/00-project-overview.md (три филиала, рост до 5+),
 * docs/22-erd.md (Branch, Hall, TrainerProfile), BR-007 (аудит изменений),
 * docs/08-database.md (мягкое удаление через archivedAt).
 *
 * Branch и Hall разделены даже при связи 1:1 в MVP: так требует ERD, чтобы
 * переход к нескольким залам не менял модель.
 *
 * Автора изменения в аудит подставляет AuditService из контекста запроса,
 * поэтому actorUserId в методы не передается.
 */
@Injectable()
export class ClubStructureService {
  private readonly logger = new Logger(ClubStructureService.name);

  constructor(
    private readonly repository: ClubStructureRepository,
    private readonly audit: AuditService,
  ) {}

  // --- Филиалы -------------------------------------------------------------

  async listBranches(options: { isActive?: boolean } = {}): Promise<BranchView[]> {
    const branches = await this.repository.listBranches(options);
    return branches.map(toBranchView);
  }

  async getBranch(id: string): Promise<BranchDetails> {
    const branch = await this.requireBranch(id);
    const halls = await this.repository.listHalls(id);
    return { ...toBranchView(branch), halls: halls.map(toHallView) };
  }

  async createBranch(input: CreateBranchInput): Promise<BranchView> {
    const branch = await this.repository.createBranch(input);
    this.logger.log(`Филиал создан: ${branch.name} (${branch.id})`);

    await this.audit.recordSafely({
      action: AuditAction.BRANCH_CREATED,
      entityType: AuditEntityType.BRANCH,
      entityId: branch.id,
      after: { name: branch.name, address: branch.address },
    });

    return toBranchView(branch);
  }

  async updateBranch(id: string, input: UpdateBranchInput): Promise<BranchView> {
    const before = await this.requireBranch(id);
    const branch = await this.repository.updateBranch(id, input);

    await this.audit.recordSafely({
      action: AuditAction.BRANCH_UPDATED,
      entityType: AuditEntityType.BRANCH,
      entityId: id,
      before: { name: before.name, isActive: before.isActive },
      after: { name: branch.name, isActive: branch.isActive },
    });

    return toBranchView(branch);
  }

  /** Мягкое удаление: филиал уходит из справочников, история сохраняется. */
  async archiveBranch(id: string): Promise<void> {
    const branch = await this.requireBranch(id);
    await this.repository.archiveBranch(id, new Date());

    await this.audit.recordSafely({
      action: AuditAction.BRANCH_ARCHIVED,
      entityType: AuditEntityType.BRANCH,
      entityId: id,
      before: { name: branch.name, isActive: branch.isActive },
    });
  }

  // --- Залы ----------------------------------------------------------------

  async listHalls(branchId: string): Promise<HallView[]> {
    await this.requireBranch(branchId);
    const halls = await this.repository.listHalls(branchId);
    return halls.map(toHallView);
  }

  async createHall(input: CreateHallInput): Promise<HallView> {
    const branch = await this.requireBranch(input.branchId);
    this.assertBranchActive(branch);

    const hall = await this.repository.createHall(input);

    await this.audit.recordSafely({
      action: AuditAction.HALL_CREATED,
      entityType: AuditEntityType.HALL,
      entityId: hall.id,
      after: { name: hall.name, branchId: hall.branchId },
    });

    return toHallView(hall);
  }

  async updateHall(id: string, input: UpdateHallInput): Promise<HallView> {
    const before = await this.requireHall(id);
    const hall = await this.repository.updateHall(id, input);

    await this.audit.recordSafely({
      action: AuditAction.HALL_UPDATED,
      entityType: AuditEntityType.HALL,
      entityId: id,
      before: { name: before.name, isActive: before.isActive },
      after: { name: hall.name, isActive: hall.isActive },
    });

    return toHallView(hall);
  }

  async archiveHall(id: string): Promise<void> {
    const hall = await this.requireHall(id);
    await this.repository.archiveHall(id, new Date());

    await this.audit.recordSafely({
      action: AuditAction.HALL_ARCHIVED,
      entityType: AuditEntityType.HALL,
      entityId: id,
      before: { name: hall.name, branchId: hall.branchId },
    });
  }

  // --- Тренеры -------------------------------------------------------------

  async listTrainers(options: { isActive?: boolean } = {}): Promise<TrainerView[]> {
    const trainers = await this.repository.listTrainers(options);
    return trainers.map(toTrainerView);
  }

  async getTrainer(id: string): Promise<TrainerView> {
    return toTrainerView(await this.requireTrainer(id));
  }

  /**
   * Создает профиль тренера.
   *
   * Аккаунт не обязателен: по docs/04-roles-permissions.md часть тренеров
   * выполняет функции администратора, но вход в систему нужен не всем.
   */
  async createTrainer(input: CreateTrainerInput): Promise<TrainerView> {
    if (input.userId) {
      const existing = await this.repository.findTrainerByUserId(input.userId);
      if (existing) {
        throw new ApiException(
          'TRAINER_ALREADY_ASSIGNED' satisfies ApiErrorCode,
          'С этим аккаунтом уже связан профиль тренера',
          { trainerId: existing.id },
        );
      }
    }

    const trainer = await this.repository.createTrainer(input);

    await this.audit.recordSafely({
      action: AuditAction.TRAINER_CREATED,
      entityType: AuditEntityType.TRAINER_PROFILE,
      entityId: trainer.id,
      after: { displayName: trainer.displayName, userId: trainer.userId },
    });

    return toTrainerView(trainer);
  }

  async updateTrainer(id: string, input: UpdateTrainerInput): Promise<TrainerView> {
    const before = await this.requireTrainer(id);
    const trainer = await this.repository.updateTrainer(id, input);

    await this.audit.recordSafely({
      action: AuditAction.TRAINER_UPDATED,
      entityType: AuditEntityType.TRAINER_PROFILE,
      entityId: id,
      before: { displayName: before.displayName, isActive: before.isActive },
      after: { displayName: trainer.displayName, isActive: trainer.isActive },
    });

    return toTrainerView(trainer);
  }

  async archiveTrainer(id: string): Promise<void> {
    const trainer = await this.requireTrainer(id);
    await this.repository.archiveTrainer(id, new Date());

    await this.audit.recordSafely({
      action: AuditAction.TRAINER_ARCHIVED,
      entityType: AuditEntityType.TRAINER_PROFILE,
      entityId: id,
      before: { displayName: trainer.displayName },
    });
  }

  /**
   * Связывает профиль тренера с аккаунтом.
   *
   * Связь дает человеку доступ к системе: тренер попадает в чаты своих групп
   * (состав вычисляется по `TrainerProfile.userId`), видит расписание и может
   * отмечать посещаемость. Поэтому операция проверяется правом на управление
   * пользователями, а не только правом на справочники клуба.
   *
   * Роль аккаунта проверяется: участник клуба (MEMBER) прав тренера не имеет, и
   * «тренер» из него получился бы только на бумаге — он не увидел бы занятий.
   * Молчаливое состояние, в котором доступ есть, а возможностей нет, хуже отказа.
   */
  async linkTrainerAccount(id: string, userId: string): Promise<TrainerView> {
    const trainer = await this.requireTrainer(id);

    if (trainer.userId === userId) {
      // Повторный вызов не ошибка: администратор мог нажать дважды.
      return toTrainerView(trainer);
    }

    if (trainer.userId !== null) {
      throw new ApiException(
        'TRAINER_ALREADY_ASSIGNED' satisfies ApiErrorCode,
        'С профилем уже связан аккаунт: сначала снимите связь',
        { currentUserId: trainer.userId },
      );
    }

    const account = await this.repository.findAccount(userId);
    if (!account) {
      throw new ApiException('NOT_FOUND' satisfies ApiErrorCode, 'Пользователь не найден');
    }

    if (account.role !== UserRole.STAFF && account.role !== UserRole.SUPERADMIN) {
      throw new ApiException(
        'TRAINER_ACCOUNT_ROLE_INVALID' satisfies ApiErrorCode,
        `Аккаунт имеет роль ${account.role}: тренеру нужна роль STAFF, иначе он не увидит занятия`,
        { role: account.role },
      );
    }

    if (account.status !== UserStatus.ACTIVE) {
      throw new ApiException(
        'TRAINER_ACCOUNT_NOT_ACTIVE' satisfies ApiErrorCode,
        `Аккаунт в статусе ${account.status}: сначала приглашение должно быть принято`,
        { status: account.status },
      );
    }

    // Аккаунт мог быть связан с другим профилем: связь уникальна (см. схему).
    const holder = await this.repository.findTrainerByUserId(userId);
    if (holder && holder.id !== id) {
      throw new ApiException(
        'TRAINER_ALREADY_ASSIGNED' satisfies ApiErrorCode,
        'С этим аккаунтом уже связан другой профиль тренера',
        { trainerId: holder.id },
      );
    }

    const linked = await this.repository.setTrainerAccount(id, userId);

    await this.audit.recordSafely({
      action: AuditAction.TRAINER_UPDATED,
      entityType: AuditEntityType.TRAINER_PROFILE,
      entityId: id,
      before: { userId: null },
      after: { userId, role: account.role },
    });

    this.logger.log(`Профиль тренера ${id} связан с аккаунтом ${userId}`);

    return toTrainerView(linked);
  }

  /**
   * Снимает связь профиля с аккаунтом.
   *
   * Профиль и история сохраняются: тренер перестает входить в систему, но
   * остается в расписании и в проведенных занятиях. Удаление профиля сломало бы
   * историю посещаемости (BR-007).
   */
  async unlinkTrainerAccount(id: string): Promise<TrainerView> {
    const trainer = await this.requireTrainer(id);

    if (trainer.userId === null) {
      throw new ApiException(
        'TRAINER_ACCOUNT_NOT_LINKED' satisfies ApiErrorCode,
        'С профилем не связан аккаунт',
      );
    }

    const unlinked = await this.repository.setTrainerAccount(id, null);

    await this.audit.recordSafely({
      action: AuditAction.TRAINER_UPDATED,
      entityType: AuditEntityType.TRAINER_PROFILE,
      entityId: id,
      before: { userId: trainer.userId },
      after: { userId: null },
    });

    this.logger.log(`Профиль тренера ${id}: связь с аккаунтом снята`);

    return toTrainerView(unlinked);
  }

  // --- Вспомогательное -----------------------------------------------------

  private async requireBranch(id: string): Promise<BranchRecord> {
    const branch = await this.repository.findBranch(id);
    if (!branch) {
      throw new ApiException('BRANCH_NOT_FOUND' satisfies ApiErrorCode, 'Филиал не найден');
    }
    return branch;
  }

  private async requireHall(id: string): Promise<HallRecord> {
    const hall = await this.repository.findHall(id);
    if (!hall) {
      throw new ApiException('HALL_NOT_FOUND' satisfies ApiErrorCode, 'Зал не найден');
    }
    return hall;
  }

  private async requireTrainer(id: string): Promise<TrainerRecord> {
    const trainer = await this.repository.findTrainer(id);
    if (!trainer) {
      throw new ApiException('TRAINER_NOT_FOUND' satisfies ApiErrorCode, 'Тренер не найден');
    }
    return trainer;
  }

  /** В неактивном филиале нельзя заводить залы: это скрыло бы данные. */
  private assertBranchActive(branch: BranchRecord): void {
    if (!branch.isActive) {
      throw new ApiException(
        'BRANCH_ARCHIVED' satisfies ApiErrorCode,
        'Филиал неактивен: сначала включите его',
      );
    }
  }
}

function toBranchView(branch: BranchRecord): BranchView {
  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    phone: branch.phone,
    isActive: branch.isActive,
    createdAt: branch.createdAt.toISOString(),
    updatedAt: branch.updatedAt.toISOString(),
  };
}

function toHallView(hall: HallRecord): HallView {
  return {
    id: hall.id,
    branchId: hall.branchId,
    name: hall.name,
    capacity: hall.capacity,
    isActive: hall.isActive,
  };
}

function toTrainerView(trainer: TrainerRecord): TrainerView {
  return {
    id: trainer.id,
    userId: trainer.userId,
    displayName: trainer.displayName,
    phone: trainer.phone,
    bio: trainer.bio,
    isActive: trainer.isActive,
  };
}
