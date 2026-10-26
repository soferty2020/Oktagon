import { Injectable } from '@nestjs/common';
import type {
  CertificationEventStatus,
  CertificationEventView,
  CreateCertificationEventInput,
  UpdateCertificationEventInput,
} from '@octagon/contracts';

import { PrismaService } from '../../prisma/prisma.service';

/** Событие в том виде, в каком оно хранится. */
export interface CertificationEventRecord {
  id: string;
  title: string;
  scheduledAt: Date;
  location: string | null;
  organizer: string | null;
  description: string | null;
  status: CertificationEventStatus;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  publishedById: string | null;
  cancelledAt: Date | null;
  createdBy: { id: string; email: string } | null;
  publishedBy: { id: string; email: string } | null;
  _count: { participants: number };
}

export interface CreateEventRecordInput extends CreateCertificationEventInput {
  createdById: string;
}

export interface UpdateEventRecordInput extends UpdateCertificationEventInput {
  status?: CertificationEventStatus;
  publishedAt?: Date | null;
  publishedById?: string | null;
  cancelledAt?: Date | null;
}

const EVENT_SELECT = {
  id: true,
  title: true,
  scheduledAt: true,
  location: true,
  organizer: true,
  description: true,
  status: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  publishedById: true,
  cancelledAt: true,
  createdBy: { select: { id: true, email: true } },
  publishedBy: { select: { id: true, email: true } },
  _count: { select: { participants: true } },
} as const;

/**
 * Доступ к мероприятиям аттестаций.
 *
 * Транзакции нужны там, где статус и время меняются вместе: «завершено» без
 * отметки времени и «опубликовано» без автора — это данные, которые потом не
 * восстановить.
 */
@Injectable()
export class CertificationEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(status?: CertificationEventStatus): Promise<CertificationEventRecord[]> {
    return this.prisma.db.certificationEvent.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ scheduledAt: 'desc' }],
      select: EVENT_SELECT,
    });
  }

  async findById(id: string): Promise<CertificationEventRecord | null> {
    return this.prisma.db.certificationEvent.findUnique({
      where: { id },
      select: EVENT_SELECT,
    });
  }

  async create(input: CreateEventRecordInput): Promise<CertificationEventRecord> {
    const { createdById, scheduledAt, ...rest } = input;

    return this.prisma.db.certificationEvent.create({
      data: {
        ...rest,
        scheduledAt: new Date(scheduledAt),
        createdById,
      },
      select: EVENT_SELECT,
    });
  }

  async update(id: string, input: UpdateEventRecordInput): Promise<CertificationEventRecord> {
    const data: Record<string, unknown> = {};

    if (input.title !== undefined) data.title = input.title;
    if (input.scheduledAt !== undefined) data.scheduledAt = new Date(input.scheduledAt);
    if (input.location !== undefined) data.location = input.location;
    if (input.organizer !== undefined) data.organizer = input.organizer;
    if (input.description !== undefined) data.description = input.description;
    if (input.status !== undefined) data.status = input.status;
    if (input.publishedAt !== undefined) data.publishedAt = input.publishedAt;
    if (input.publishedById !== undefined) data.publishedById = input.publishedById;
    if (input.cancelledAt !== undefined) data.cancelledAt = input.cancelledAt;

    return this.prisma.db.certificationEvent.update({
      where: { id },
      data,
      select: EVENT_SELECT,
    });
  }

  /** Сколько участников ещё без итога: завершить мероприятие нельзя, пока есть такие. */
  async countPendingResults(eventId: string): Promise<number> {
    return this.prisma.db.certificationParticipant.count({
      where: { eventId, result: 'PENDING' },
    });
  }
}

/** Запись → ответ API. */
export function toEventView(record: CertificationEventRecord): CertificationEventView {
  return {
    id: record.id,
    title: record.title,
    scheduledAt: record.scheduledAt.toISOString(),
    location: record.location,
    organizer: record.organizer,
    description: record.description,
    status: record.status,
    participantsCount: record._count.participants,
    createdBy: record.createdBy,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    publishedBy: record.publishedBy,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
