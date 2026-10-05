import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface BranchRecord {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface HallRecord {
  id: string;
  branchId: string;
  name: string;
  capacity: number | null;
  isActive: boolean;
}

export interface TrainerRecord {
  id: string;
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
  userId?: string | null;
}

export interface UpdateTrainerInput {
  displayName?: string;
  phone?: string | null;
  bio?: string | null;
  isActive?: boolean;
}

/**
 * Доступ к структуре клуба.
 *
 * Абстрактный класс как DI-токен: сервис не зависит от Prisma и тестируется
 * без БД (docs/13-architecture.md).
 */
export abstract class ClubStructureRepository {
  abstract listBranches(options: { isActive?: boolean }): Promise<BranchRecord[]>;
  abstract findBranch(id: string): Promise<BranchRecord | null>;
  abstract createBranch(input: CreateBranchInput): Promise<BranchRecord>;
  abstract updateBranch(id: string, input: UpdateBranchInput): Promise<BranchRecord>;
  /** Мягкое удаление: archivedAt (docs/08-database.md). */
  abstract archiveBranch(id: string, at: Date): Promise<void>;

  abstract listHalls(branchId: string): Promise<HallRecord[]>;
  abstract findHall(id: string): Promise<HallRecord | null>;
  abstract createHall(input: CreateHallInput): Promise<HallRecord>;
  abstract updateHall(id: string, input: UpdateHallInput): Promise<HallRecord>;
  abstract archiveHall(id: string, at: Date): Promise<void>;

  abstract listTrainers(options: { isActive?: boolean }): Promise<TrainerRecord[]>;
  abstract findTrainer(id: string): Promise<TrainerRecord | null>;
  abstract findTrainerByUserId(userId: string): Promise<TrainerRecord | null>;
  abstract createTrainer(input: CreateTrainerInput): Promise<TrainerRecord>;
  abstract updateTrainer(id: string, input: UpdateTrainerInput): Promise<TrainerRecord>;
  abstract archiveTrainer(id: string, at: Date): Promise<void>;
}

const BRANCH_SELECT = {
  id: true,
  name: true,
  address: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const HALL_SELECT = {
  id: true,
  branchId: true,
  name: true,
  capacity: true,
  isActive: true,
} as const;

const TRAINER_SELECT = {
  id: true,
  userId: true,
  displayName: true,
  phone: true,
  bio: true,
  isActive: true,
} as const;

@Injectable()
export class PrismaClubStructureRepository extends ClubStructureRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listBranches(options: { isActive?: boolean }): Promise<BranchRecord[]> {
    return this.prisma.db.branch.findMany({
      where: {
        archivedAt: null,
        ...(options.isActive === undefined ? {} : { isActive: options.isActive }),
      },
      orderBy: { name: 'asc' },
      select: BRANCH_SELECT,
    });
  }

  async findBranch(id: string): Promise<BranchRecord | null> {
    return this.prisma.db.branch.findFirst({ where: { id, archivedAt: null }, select: BRANCH_SELECT });
  }

  async createBranch(input: CreateBranchInput): Promise<BranchRecord> {
    return this.prisma.db.branch.create({
      data: { name: input.name, address: input.address ?? null, phone: input.phone ?? null },
      select: BRANCH_SELECT,
    });
  }

  async updateBranch(id: string, input: UpdateBranchInput): Promise<BranchRecord> {
    return this.prisma.db.branch.update({ where: { id }, data: input, select: BRANCH_SELECT });
  }

  async archiveBranch(id: string, at: Date): Promise<void> {
    await this.prisma.db.branch.update({
      where: { id },
      data: { archivedAt: at, isActive: false },
    });
  }

  async listHalls(branchId: string): Promise<HallRecord[]> {
    return this.prisma.db.hall.findMany({
      where: { branchId, archivedAt: null },
      orderBy: { name: 'asc' },
      select: HALL_SELECT,
    });
  }

  async findHall(id: string): Promise<HallRecord | null> {
    return this.prisma.db.hall.findFirst({ where: { id, archivedAt: null }, select: HALL_SELECT });
  }

  async createHall(input: CreateHallInput): Promise<HallRecord> {
    return this.prisma.db.hall.create({
      data: {
        branchId: input.branchId,
        name: input.name,
        capacity: input.capacity ?? null,
      },
      select: HALL_SELECT,
    });
  }

  async updateHall(id: string, input: UpdateHallInput): Promise<HallRecord> {
    return this.prisma.db.hall.update({ where: { id }, data: input, select: HALL_SELECT });
  }

  async archiveHall(id: string, at: Date): Promise<void> {
    await this.prisma.db.hall.update({
      where: { id },
      data: { archivedAt: at, isActive: false },
    });
  }

  async listTrainers(options: { isActive?: boolean }): Promise<TrainerRecord[]> {
    return this.prisma.db.trainerProfile.findMany({
      where: {
        archivedAt: null,
        ...(options.isActive === undefined ? {} : { isActive: options.isActive }),
      },
      orderBy: { displayName: 'asc' },
      select: TRAINER_SELECT,
    });
  }

  async findTrainer(id: string): Promise<TrainerRecord | null> {
    return this.prisma.db.trainerProfile.findFirst({
      where: { id, archivedAt: null },
      select: TRAINER_SELECT,
    });
  }

  async findTrainerByUserId(userId: string): Promise<TrainerRecord | null> {
    return this.prisma.db.trainerProfile.findFirst({
      where: { userId, archivedAt: null },
      select: TRAINER_SELECT,
    });
  }

  async createTrainer(input: CreateTrainerInput): Promise<TrainerRecord> {
    // Отдельные ветки: со связанным аккаунтом Prisma требует relation connect,
    // без аккаунта — явный userId: null (unchecked-вариант входа).
    const base = {
      displayName: input.displayName,
      phone: input.phone ?? null,
      bio: input.bio ?? null,
    };

    if (input.userId) {
      return this.prisma.db.trainerProfile.create({
        data: { ...base, user: { connect: { id: input.userId } } },
        select: TRAINER_SELECT,
      });
    }

    // Без аккаунта используется unchecked-вариант: он допускает userId: null,
    // тогда как checked-вариант требует relation connect.
    return this.prisma.db.trainerProfile.create({
      data: { ...base, userId: null },
      select: TRAINER_SELECT,
    });
  }

  async updateTrainer(id: string, input: UpdateTrainerInput): Promise<TrainerRecord> {
    return this.prisma.db.trainerProfile.update({
      where: { id },
      data: input,
      select: TRAINER_SELECT,
    });
  }

  async archiveTrainer(id: string, at: Date): Promise<void> {
    await this.prisma.db.trainerProfile.update({
      where: { id },
      data: { archivedAt: at, isActive: false },
    });
  }
}
