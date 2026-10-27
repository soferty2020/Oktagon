import { Injectable } from '@nestjs/common';
import { LinkRequestStatus } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AthleteLinkCodeIssued,
  LinkRequestCandidate,
  LinkRequestView,
} from '@octagon/contracts';

export interface LinkCodeRecord {
  id: string;
  athleteId: string;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface LinkRequestRecord {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  phone: string | null;
  status: LinkRequestStatus;
  athleteId: string | null;
  rejectReason: string | null;
  createdAt: Date;
}

export interface CreateLinkRequestRecord {
  userId: string;
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  phone: string | null;
}

const REQUEST_SELECT = {
  id: true,
  userId: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  phone: true,
  status: true,
  athleteId: true,
  rejectReason: true,
  createdAt: true,
} as const;

/**
 * Доступ к данным онбординга (ADR-0015).
 *
 * Абстрактный класс как DI-токен: сервис не знает про Prisma и тестируется без
 * базы — как остальные модули (docs/13-architecture.md).
 */
export abstract class OnboardingRepository {
  abstract clearActiveCodes(athleteId: string): Promise<void>;
  abstract createCode(input: {
    athleteId: string;
    codeHash: string;
    createdBy: string;
    expiresAt: Date;
  }): Promise<LinkCodeRecord>;
  abstract findCode(codeHash: string): Promise<LinkCodeRecord | null>;
  abstract markCodeUsed(codeId: string, userId: string): Promise<void>;

  abstract isLinked(userId: string, athleteId: string): Promise<boolean>;
  abstract linkAthlete(userId: string, athleteId: string): Promise<void>;

  abstract createRequest(input: CreateLinkRequestRecord): Promise<LinkRequestRecord>;
  abstract findRequest(requestId: string): Promise<LinkRequestRecord | null>;
  abstract hasPendingRequest(userId: string, lastName: string, firstName: string): Promise<boolean>;
  abstract listRequests(userId: string): Promise<LinkRequestRecord[]>;
  abstract listPending(): Promise<LinkRequestRecord[]>;
  abstract approveRequest(input: {
    requestId: string;
    athleteId: string;
    reviewerId: string;
  }): Promise<LinkRequestRecord>;
  abstract rejectRequest(input: {
    requestId: string;
    reason: string;
    reviewerId: string;
  }): Promise<LinkRequestRecord>;

  abstract findCandidates(input: {
    lastName: string;
    firstName: string;
    birthDate: Date | null;
  }): Promise<LinkRequestCandidate[]>;
}

@Injectable()
export class PrismaOnboardingRepository extends OnboardingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async clearActiveCodes(athleteId: string): Promise<void> {
    // Старые коды гасим: действующим должен быть только последний выданный,
    // иначе забытый код из переписки продолжает работать.
    await this.prisma.db.athleteLinkCode.updateMany({
      where: { athleteId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    });
  }

  async createCode(input: {
    athleteId: string;
    codeHash: string;
    createdBy: string;
    expiresAt: Date;
  }): Promise<LinkCodeRecord> {
    return this.prisma.db.athleteLinkCode.create({
      data: input,
      select: { id: true, athleteId: true, codeHash: true, expiresAt: true, usedAt: true },
    });
  }

  async findCode(codeHash: string): Promise<LinkCodeRecord | null> {
    return this.prisma.db.athleteLinkCode.findUnique({
      where: { codeHash },
      select: { id: true, athleteId: true, codeHash: true, expiresAt: true, usedAt: true },
    });
  }

  async markCodeUsed(codeId: string, userId: string): Promise<void> {
    await this.prisma.db.athleteLinkCode.update({
      where: { id: codeId },
      data: { usedAt: new Date(), usedBy: userId },
    });
  }

  async isLinked(userId: string, athleteId: string): Promise<boolean> {
    const link = await this.prisma.db.userAthlete.findFirst({
      where: { userId, athleteId },
      select: { id: true },
    });

    return link !== null;
  }

  async linkAthlete(userId: string, athleteId: string): Promise<void> {
    const existing = await this.prisma.db.userAthlete.count({ where: { athleteId } });

    await this.prisma.db.userAthlete.create({
      data: {
        userId,
        athleteId,
        relation: 'PARENT',
        // Первый родитель — основной; второй не перебивает.
        isPrimary: existing === 0,
      },
    });
  }

  async createRequest(input: CreateLinkRequestRecord): Promise<LinkRequestRecord> {
    return this.prisma.db.linkRequest.create({
      data: {
        userId: input.userId,
        firstName: input.firstName,
        lastName: input.lastName,
        birthDate: input.birthDate,
        phone: input.phone,
      },
      select: REQUEST_SELECT,
    });
  }

  async findRequest(requestId: string): Promise<LinkRequestRecord | null> {
    return this.prisma.db.linkRequest.findUnique({
      where: { id: requestId },
      select: REQUEST_SELECT,
    });
  }

  async hasPendingRequest(userId: string, lastName: string, firstName: string): Promise<boolean> {
    const found = await this.prisma.db.linkRequest.findFirst({
      where: {
        userId,
        status: LinkRequestStatus.PENDING,
        lastName: { equals: lastName, mode: 'insensitive' },
        firstName: { equals: firstName, mode: 'insensitive' },
      },
      select: { id: true },
    });

    return found !== null;
  }

  async listRequests(userId: string): Promise<LinkRequestRecord[]> {
    return this.prisma.db.linkRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: REQUEST_SELECT,
    });
  }

  async listPending(): Promise<LinkRequestRecord[]> {
    return this.prisma.db.linkRequest.findMany({
      where: { status: LinkRequestStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      select: REQUEST_SELECT,
    });
  }

  async approveRequest(input: {
    requestId: string;
    athleteId: string;
    reviewerId: string;
  }): Promise<LinkRequestRecord> {
    return this.prisma.db.linkRequest.update({
      where: { id: input.requestId },
      data: {
        status: LinkRequestStatus.APPROVED,
        athleteId: input.athleteId,
        reviewedBy: input.reviewerId,
        reviewedAt: new Date(),
        rejectReason: null,
      },
      select: REQUEST_SELECT,
    });
  }

  async rejectRequest(input: {
    requestId: string;
    reason: string;
    reviewerId: string;
  }): Promise<LinkRequestRecord> {
    return this.prisma.db.linkRequest.update({
      where: { id: input.requestId },
      data: {
        status: LinkRequestStatus.REJECTED,
        rejectReason: input.reason,
        reviewedBy: input.reviewerId,
        reviewedAt: new Date(),
      },
      select: REQUEST_SELECT,
    });
  }

  async findCandidates(input: {
    lastName: string;
    firstName: string;
    birthDate: Date | null;
  }): Promise<LinkRequestCandidate[]> {
    // Совпадение по фамилии — основное; дата рождения подсказывает точнее.
    // Точное равенство и «начинается с»: родители часто путают окончания.
    const athletes = await this.prisma.db.athlete.findMany({
      where: {
        archivedAt: null,
        OR: [
          { lastName: { equals: input.lastName, mode: 'insensitive' } },
          { lastName: { startsWith: input.lastName, mode: 'insensitive' } },
        ],
      },
      take: 10,
      orderBy: { lastName: 'asc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        memberships: {
          where: { state: 'ACTIVE' },
          take: 1,
          orderBy: { joinedAt: 'desc' },
          select: { group: { select: { name: true } } },
        },
      },
    });

    return athletes.map((athlete) => ({
      athleteId: athlete.id,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      birthDate: athlete.birthDate ? athlete.birthDate.toISOString().slice(0, 10) : null,
      groupName: athlete.memberships[0]?.group.name ?? null,
    }));
  }
}

export function toLinkRequestView(record: LinkRequestRecord): LinkRequestView {
  return {
    id: record.id,
    status: record.status,
    firstName: record.firstName,
    lastName: record.lastName,
    birthDate: record.birthDate ? record.birthDate.toISOString().slice(0, 10) : null,
    phone: record.phone,
    athleteId: record.athleteId,
    rejectReason: record.rejectReason,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toIssuedCode(record: LinkCodeRecord, code: string): AthleteLinkCodeIssued {
  return {
    code,
    athleteId: record.athleteId,
    expiresAt: record.expiresAt.toISOString(),
  };
}
