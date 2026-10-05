import { Injectable } from '@nestjs/common';
import { TrainingSessionStatus, Weekday } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

export interface ScheduleSlotRecord {
  id: string;
  weekday: Weekday;
  /** Локальное время клуба в формате HH:mm. */
  startTime: string;
  endTime: string;
  hallId: string | null;
  hallName: string | null;
  trainerId: string | null;
  trainerName: string | null;
}

export interface ScheduleTemplateRecord {
  id: string;
  groupId: string;
  groupName: string;
  year: number;
  quarter: number;
  validFrom: Date;
  validTo: Date;
  publishedAt: Date | null;
  slots: ScheduleSlotRecord[];
}

export interface TrainingSessionRecord {
  id: string;
  groupId: string;
  groupName: string;
  branchId: string | null;
  hallId: string | null;
  hallName: string | null;
  trainerId: string | null;
  trainerName: string | null;
  startsAt: Date;
  endsAt: Date;
  status: TrainingSessionStatus;
  changeReason: string | null;
  cancelledAt: Date | null;
  scheduleTemplateId: string | null;
}

export interface CreateTemplateInput {
  groupId: string;
  year: number;
  quarter: number;
  validFrom: Date;
  validTo: Date;
}

export interface AddSlotInput {
  templateId: string;
  weekday: Weekday;
  startTime: string;
  endTime: string;
  hallId: string | null;
  trainerId: string | null;
}

export interface UpdateSlotInput {
  weekday?: Weekday;
  startTime?: string;
  endTime?: string;
  hallId?: string | null;
  trainerId?: string | null;
}

export interface CreateSessionsInput {
  groupId: string;
  branchId: string | null;
  hallId: string | null;
  trainerId: string | null;
  scheduleTemplateId: string | null;
  startsAt: Date;
  endsAt: Date;
}

export interface SessionRangeFilter {
  from: Date;
  to: Date;
  groupId?: string;
  trainerId?: string;
  status?: TrainingSessionStatus;
  visibleGroupIds?: string[] | null;
}

export interface UpdateSessionInput {
  startsAt?: Date;
  endsAt?: Date;
  hallId?: string | null;
  trainerId?: string | null;
  status?: TrainingSessionStatus;
  changeReason?: string | null;
  cancelledAt?: Date | null;
  cancelledById?: string | null;
}

export interface GroupDefaultsRecord {
  /** Основной филиал группы, если он назначен. */
  branchId: string | null;
}

/**
 * Доступ к расписанию.
 *
 * Абстрактный класс как DI-токен: сервис не зависит от Prisma и тестируется
 * без БД (docs/13-architecture.md).
 */
export abstract class SchedulingRepository {
  abstract findTemplateByPeriod(
    groupId: string,
    year: number,
    quarter: number,
  ): Promise<ScheduleTemplateRecord | null>;
  abstract findTemplate(id: string): Promise<ScheduleTemplateRecord | null>;
  abstract listTemplates(filter: {
    groupId?: string;
    year?: number;
    visibleGroupIds?: string[] | null;
  }): Promise<ScheduleTemplateRecord[]>;
  abstract createTemplate(input: CreateTemplateInput): Promise<ScheduleTemplateRecord>;
  abstract publishTemplate(id: string, publishedAt: Date): Promise<ScheduleTemplateRecord>;
  abstract deleteTemplate(id: string): Promise<void>;

  abstract addSlot(input: AddSlotInput): Promise<ScheduleSlotRecord>;
  abstract findSlot(id: string): Promise<ScheduleSlotRecord | null>;
  /**
   * Шаблон и группа по слоту.
   *
   * Слот не хранит группу, а для проверки доступа она нужна: отдельный метод
   * дешевле, чем загрузка всех шаблонов.
   */
  abstract findTemplateBySlot(
    slotId: string,
  ): Promise<{ templateId: string; groupId: string } | null>;
  abstract updateSlot(id: string, input: UpdateSlotInput): Promise<ScheduleSlotRecord>;
  abstract deleteSlot(id: string): Promise<boolean>;

  /**
   * Занятия в периоде с фильтрами.
   *
   * `visibleGroupIds === null` означает «ограничений нет»; пустой массив —
   * «не видно ничего». Это разные вещи, и путать их нельзя.
   */
  abstract listSessions(filter: SessionRangeFilter): Promise<TrainingSessionRecord[]>;
  abstract findSession(id: string): Promise<TrainingSessionRecord | null>;
  /** Начатые занятия: их нельзя удалять при пересоздании и менять точечно. */
  abstract countStartedSessions(templateId: string, now: Date): Promise<number>;
  abstract deleteFutureSessions(templateId: string, now: Date): Promise<number>;
  abstract createSessions(input: CreateSessionsInput[]): Promise<number>;
  abstract updateSession(id: string, input: UpdateSessionInput): Promise<TrainingSessionRecord>;
  /** Обновляет занятие, только если оно еще не началось. */
  abstract updateFutureSession(
    id: string,
    now: Date,
    input: UpdateSessionInput,
  ): Promise<TrainingSessionRecord | null>;
}

const SLOT_SELECT = {
  id: true,
  weekday: true,
  startTime: true,
  endTime: true,
  hallId: true,
  trainerProfileId: true,
} as const;

const SESSION_SELECT = {
  id: true,
  groupId: true,
  branchId: true,
  hallId: true,
  trainerProfileId: true,
  scheduleTemplateId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  changeReason: true,
  cancelledAt: true,
} as const;

/**
 * Время в БД хранится типом `time`: Prisma отдает Date на дате 1970-01-01,
 * поэтому часы и минуты читаются в UTC.
 */
function timeToHhMm(value: Date): string {
  return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
}

function hhMmToDate(value: string): Date {
  const [hours, minutes] = value.split(':');
  return new Date(Date.UTC(1970, 0, 1, Number(hours), Number(minutes)));
}

@Injectable()
export class PrismaSchedulingRepository extends SchedulingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findTemplateByPeriod(
    groupId: string,
    year: number,
    quarter: number,
  ): Promise<ScheduleTemplateRecord | null> {
    const template = await this.prisma.db.scheduleTemplate.findUnique({
      where: { groupId_year_quarter: { groupId, year, quarter } },
      select: {
        id: true,
        groupId: true,
        year: true,
        quarter: true,
        validFrom: true,
        validTo: true,
        publishedAt: true,
        group: { select: { name: true } },
        slots: { select: SLOT_SELECT, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] },
      },
    });

    return template ? toTemplateRecord(template) : null;
  }

  async findTemplate(id: string): Promise<ScheduleTemplateRecord | null> {
    const template = await this.prisma.db.scheduleTemplate.findUnique({
      where: { id },
      select: {
        id: true,
        groupId: true,
        year: true,
        quarter: true,
        validFrom: true,
        validTo: true,
        publishedAt: true,
        group: { select: { name: true } },
        slots: { select: SLOT_SELECT, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] },
      },
    });

    return template ? toTemplateRecord(template) : null;
  }

  async listTemplates(filter: {
    groupId?: string;
    year?: number;
    visibleGroupIds?: string[] | null;
  }): Promise<ScheduleTemplateRecord[]> {
    const visible = filter.visibleGroupIds;
    if (visible && visible.length === 0) {
      return [];
    }

    const templates = await this.prisma.db.scheduleTemplate.findMany({
      where: {
        ...(filter.groupId ? { groupId: filter.groupId } : {}),
        ...(filter.year ? { year: filter.year } : {}),
        ...(visible ? { groupId: { in: visible } } : {}),
        group: { archivedAt: null },
      },
      orderBy: [{ year: 'desc' }, { quarter: 'desc' }],
      select: {
        id: true,
        groupId: true,
        year: true,
        quarter: true,
        validFrom: true,
        validTo: true,
        publishedAt: true,
        group: { select: { name: true } },
        slots: { select: SLOT_SELECT, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] },
      },
    });

    return templates.map(toTemplateRecord);
  }

  async createTemplate(input: CreateTemplateInput): Promise<ScheduleTemplateRecord> {
    const template = await this.prisma.db.scheduleTemplate.create({
      data: {
        groupId: input.groupId,
        year: input.year,
        quarter: input.quarter,
        validFrom: input.validFrom,
        validTo: input.validTo,
      },
      select: {
        id: true,
        groupId: true,
        year: true,
        quarter: true,
        validFrom: true,
        validTo: true,
        publishedAt: true,
        group: { select: { name: true } },
        slots: { select: SLOT_SELECT },
      },
    });

    return toTemplateRecord(template);
  }

  async publishTemplate(id: string, publishedAt: Date): Promise<ScheduleTemplateRecord> {
    const template = await this.prisma.db.scheduleTemplate.update({
      where: { id },
      data: { publishedAt },
      select: {
        id: true,
        groupId: true,
        year: true,
        quarter: true,
        validFrom: true,
        validTo: true,
        publishedAt: true,
        group: { select: { name: true } },
        slots: { select: SLOT_SELECT, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] },
      },
    });

    return toTemplateRecord(template);
  }

  async deleteTemplate(id: string): Promise<void> {
    await this.prisma.db.scheduleTemplate.delete({ where: { id } });
  }

  async addSlot(input: AddSlotInput): Promise<ScheduleSlotRecord> {
    const slot = await this.prisma.db.scheduleTemplateSlot.create({
      data: {
        scheduleTemplateId: input.templateId,
        weekday: input.weekday,
        startTime: hhMmToDate(input.startTime),
        endTime: hhMmToDate(input.endTime),
        hallId: input.hallId,
        trainerProfileId: input.trainerId,
      },
      select: SLOT_SELECT,
    });

    return this.toSlotRecord(slot);
  }

  async findSlot(id: string): Promise<ScheduleSlotRecord | null> {
    const slot = await this.prisma.db.scheduleTemplateSlot.findUnique({
      where: { id },
      select: SLOT_SELECT,
    });

    return slot ? this.toSlotRecord(slot) : null;
  }

  async findTemplateBySlot(
    slotId: string,
  ): Promise<{ templateId: string; groupId: string } | null> {
    const slot = await this.prisma.db.scheduleTemplateSlot.findUnique({
      where: { id: slotId },
      select: { scheduleTemplateId: true, scheduleTemplate: { select: { groupId: true } } },
    });

    if (!slot) {
      return null;
    }
    return { templateId: slot.scheduleTemplateId, groupId: slot.scheduleTemplate.groupId };
  }

  async updateSlot(id: string, input: UpdateSlotInput): Promise<ScheduleSlotRecord> {
    const slot = await this.prisma.db.scheduleTemplateSlot.update({
      where: { id },
      data: {
        ...(input.weekday ? { weekday: input.weekday } : {}),
        ...(input.startTime ? { startTime: hhMmToDate(input.startTime) } : {}),
        ...(input.endTime ? { endTime: hhMmToDate(input.endTime) } : {}),
        ...(input.hallId !== undefined ? { hallId: input.hallId } : {}),
        ...(input.trainerId !== undefined ? { trainerProfileId: input.trainerId } : {}),
      },
      select: SLOT_SELECT,
    });

    return this.toSlotRecord(slot);
  }

  async deleteSlot(id: string): Promise<boolean> {
    const result = await this.prisma.db.scheduleTemplateSlot.deleteMany({ where: { id } });
    return result.count > 0;
  }

  async listSessions(filter: SessionRangeFilter): Promise<TrainingSessionRecord[]> {
    const visible = filter.visibleGroupIds;
    if (visible && visible.length === 0) {
      return [];
    }

    const sessions = await this.prisma.db.trainingSession.findMany({
      where: {
        startsAt: { gte: filter.from, lt: filter.to },
        ...(filter.groupId ? { groupId: filter.groupId } : {}),
        ...(filter.trainerId ? { trainerProfileId: filter.trainerId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(visible ? { groupId: { in: visible } } : {}),
      },
      orderBy: { startsAt: 'asc' },
      select: SESSION_SELECT,
    });

    return this.enrich(sessions);
  }

  async findSession(id: string): Promise<TrainingSessionRecord | null> {
    const session = await this.prisma.db.trainingSession.findUnique({
      where: { id },
      select: SESSION_SELECT,
    });

    if (!session) {
      return null;
    }

    const [enriched] = await this.enrich([session]);
    return enriched ?? null;
  }

  async countStartedSessions(templateId: string, now: Date): Promise<number> {
    return this.prisma.db.trainingSession.count({
      where: { scheduleTemplateId: templateId, startsAt: { lte: now } },
    });
  }

  async deleteFutureSessions(templateId: string, now: Date): Promise<number> {
    // Удаляются только занятия, которые еще не начались: прошедшее занятие —
    // факт истории, его пересоздание стерло бы посещаемость (BR-009).
    const result = await this.prisma.db.trainingSession.deleteMany({
      where: { scheduleTemplateId: templateId, startsAt: { gt: now } },
    });
    return result.count;
  }

  async createSessions(input: CreateSessionsInput[]): Promise<number> {
    if (input.length === 0) {
      return 0;
    }

    // skipDuplicates опирается на уникальность (groupId, startsAt): повторная
    // генерация не создает дублей.
    const result = await this.prisma.db.trainingSession.createMany({
      data: input.map((session) => ({
        groupId: session.groupId,
        branchId: session.branchId,
        hallId: session.hallId,
        trainerProfileId: session.trainerId,
        scheduleTemplateId: session.scheduleTemplateId,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  async updateSession(id: string, input: UpdateSessionInput): Promise<TrainingSessionRecord> {
    const session = await this.prisma.db.trainingSession.update({
      where: { id },
      data: {
        ...(input.startsAt ? { startsAt: input.startsAt } : {}),
        ...(input.endsAt ? { endsAt: input.endsAt } : {}),
        ...(input.hallId !== undefined ? { hallId: input.hallId } : {}),
        ...(input.trainerId !== undefined ? { trainerProfileId: input.trainerId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.changeReason !== undefined ? { changeReason: input.changeReason } : {}),
        ...(input.cancelledAt !== undefined ? { cancelledAt: input.cancelledAt } : {}),
        ...(input.cancelledById !== undefined ? { cancelledById: input.cancelledById } : {}),
      },
      select: SESSION_SELECT,
    });

    const [enriched] = await this.enrich([session]);
    return enriched as TrainingSessionRecord;
  }

  async updateFutureSession(
    id: string,
    now: Date,
    input: UpdateSessionInput,
  ): Promise<TrainingSessionRecord | null> {
    const result = await this.prisma.db.trainingSession.updateMany({
      where: { id, startsAt: { gt: now } },
      data: {
        ...(input.startsAt ? { startsAt: input.startsAt } : {}),
        ...(input.endsAt ? { endsAt: input.endsAt } : {}),
        ...(input.hallId !== undefined ? { hallId: input.hallId } : {}),
        ...(input.trainerId !== undefined ? { trainerProfileId: input.trainerId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.changeReason !== undefined ? { changeReason: input.changeReason } : {}),
        ...(input.cancelledAt !== undefined ? { cancelledAt: input.cancelledAt } : {}),
        ...(input.cancelledById !== undefined ? { cancelledById: input.cancelledById } : {}),
      },
    });

    if (result.count === 0) {
      return null;
    }
    return this.findSession(id);
  }

  /** Дополняет занятия названиями группы, зала и тренера. */
  private async enrich(
    sessions: {
      id: string;
      groupId: string;
      branchId: string | null;
      hallId: string | null;
      trainerProfileId: string | null;
      scheduleTemplateId: string | null;
      startsAt: Date;
      endsAt: Date;
      status: TrainingSessionStatus;
      changeReason: string | null;
      cancelledAt: Date | null;
    }[],
  ): Promise<TrainingSessionRecord[]> {
    if (sessions.length === 0) {
      return [];
    }

    const groupIds = [...new Set(sessions.map((session) => session.groupId))];
    const hallIds = [
      ...new Set(sessions.map((session) => session.hallId).filter((id): id is string => Boolean(id))),
    ];
    const trainerIds = [
      ...new Set(
        sessions.map((session) => session.trainerProfileId).filter((id): id is string => Boolean(id)),
      ),
    ];

    const [groups, halls, trainers] = await Promise.all([
      this.prisma.db.group.findMany({
        where: { id: { in: groupIds } },
        select: { id: true, name: true },
      }),
      hallIds.length > 0
        ? this.prisma.db.hall.findMany({
            where: { id: { in: hallIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      trainerIds.length > 0
        ? this.prisma.db.trainerProfile.findMany({
            where: { id: { in: trainerIds } },
            select: { id: true, displayName: true },
          })
        : Promise.resolve([]),
    ]);

    const groupNames = new Map(groups.map((group) => [group.id, group.name]));
    const hallNames = new Map(halls.map((hall) => [hall.id, hall.name]));
    const trainerNames = new Map(trainers.map((trainer) => [trainer.id, trainer.displayName]));

    return sessions.map((session) => ({
      id: session.id,
      groupId: session.groupId,
      groupName: groupNames.get(session.groupId) ?? '',
      branchId: session.branchId,
      hallId: session.hallId,
      hallName: session.hallId ? (hallNames.get(session.hallId) ?? null) : null,
      trainerId: session.trainerProfileId,
      trainerName: session.trainerProfileId
        ? (trainerNames.get(session.trainerProfileId) ?? null)
        : null,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      status: session.status,
      changeReason: session.changeReason,
      cancelledAt: session.cancelledAt,
      scheduleTemplateId: session.scheduleTemplateId,
    }));
  }

  private async toSlotRecord(slot: {
    id: string;
    weekday: Weekday;
    startTime: Date;
    endTime: Date;
    hallId: string | null;
    trainerProfileId: string | null;
  }): Promise<ScheduleSlotRecord> {
    const [hall, trainer] = await Promise.all([
      slot.hallId
        ? this.prisma.db.hall.findUnique({ where: { id: slot.hallId }, select: { name: true } })
        : Promise.resolve(null),
      slot.trainerProfileId
        ? this.prisma.db.trainerProfile.findUnique({
            where: { id: slot.trainerProfileId },
            select: { displayName: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      id: slot.id,
      weekday: slot.weekday,
      startTime: timeToHhMm(slot.startTime),
      endTime: timeToHhMm(slot.endTime),
      hallId: slot.hallId,
      hallName: hall?.name ?? null,
      trainerId: slot.trainerProfileId,
      trainerName: trainer?.displayName ?? null,
    };
  }
}

function toTemplateRecord(template: {
  id: string;
  groupId: string;
  year: number;
  quarter: number;
  validFrom: Date;
  validTo: Date;
  publishedAt: Date | null;
  group: { name: string };
  slots: {
    id: string;
    weekday: Weekday;
    startTime: Date;
    endTime: Date;
    hallId: string | null;
    trainerProfileId: string | null;
  }[];
}): ScheduleTemplateRecord {
  return {
    id: template.id,
    groupId: template.groupId,
    groupName: template.group.name,
    year: template.year,
    quarter: template.quarter,
    validFrom: template.validFrom,
    validTo: template.validTo,
    publishedAt: template.publishedAt,
    // Названия зала и тренера подтягиваются отдельно: в списке шаблонов слотов
    // мало, поэтому это дешевле, чем join по каждому.
    slots: template.slots.map((slot) => ({
      id: slot.id,
      weekday: slot.weekday,
      startTime: timeToHhMm(slot.startTime),
      endTime: timeToHhMm(slot.endTime),
      hallId: slot.hallId,
      hallName: null,
      trainerId: slot.trainerProfileId,
      trainerName: null,
    })),
  };
}
