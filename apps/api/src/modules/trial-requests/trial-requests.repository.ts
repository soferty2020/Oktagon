import { Injectable } from '@nestjs/common';
import type { TrialRequestStatus, TrialRequestView } from '@octagon/contracts';

import { PrismaService } from '../../prisma/prisma.service';

export interface TrialRequestRecord {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  childName: string | null;
  childAge: number | null;
  comment: string | null;
  source: string | null;
  status: TrialRequestStatus;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  processedBy: { id: string; email: string } | null;
}

const TRIAL_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  childName: true,
  childAge: true,
  comment: true,
  source: true,
  status: true,
  processedAt: true,
  createdAt: true,
  updatedAt: true,
  processedBy: { select: { id: true, email: true } },
} as const;

/** Доступ к заявкам на пробную тренировку (ADR-0013). */
@Injectable()
export class TrialRequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(status?: TrialRequestStatus): Promise<TrialRequestRecord[]> {
    return this.prisma.db.trialRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ createdAt: 'desc' }],
      select: TRIAL_SELECT,
    });
  }

  async findById(id: string): Promise<TrialRequestRecord | null> {
    return this.prisma.db.trialRequest.findUnique({ where: { id }, select: TRIAL_SELECT });
  }

  async create(input: {
    name: string;
    phone: string;
    email?: string | null;
    childName?: string | null;
    childAge?: number | null;
    comment?: string | null;
    source?: string | null;
  }): Promise<TrialRequestRecord> {
    return this.prisma.db.trialRequest.create({ data: input, select: TRIAL_SELECT });
  }

  async updateStatus(
    id: string,
    status: TrialRequestStatus,
    processedById: string,
  ): Promise<TrialRequestRecord> {
    return this.prisma.db.trialRequest.update({
      where: { id },
      data: { status, processedAt: new Date(), processedById },
      select: TRIAL_SELECT,
    });
  }
}

/** Запись → ответ API. */
export function toTrialRequestView(record: TrialRequestRecord): TrialRequestView {
  return {
    id: record.id,
    name: record.name,
    phone: record.phone,
    email: record.email,
    childName: record.childName,
    childAge: record.childAge,
    comment: record.comment,
    status: record.status,
    source: record.source,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    processedAt: record.processedAt?.toISOString() ?? null,
    processedBy: record.processedBy,
  };
}
