import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  WEEKDAY_LABELS,
  type AddScheduleSlotInput,
  type CancelSessionInput,
  type CreateScheduleTemplateInput,
  type CreateSessionInput,
  type GenerateSessionsInput,
  type GenerateSessionsResult,
  type ListSessionsQuery,
  type MoveSessionInput,
  type ScheduleSlotView,
  type ScheduleTemplateView,
  type TrainingSessionStatus,
  type TrainingSessionView,
  type UpdateScheduleSlotInput,
  type Weekday,
} from '@octagon/contracts';

import { TrainingSessionStatus as PrismaSessionStatus } from '../../../generated/prisma';import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { GroupsRepository } from '../groups/groups.repository';
import { ResourceScopeService } from '../identity/resource-scope.service';
import {
  intervalsOverlap,
  localToUtc,
  parseCalendarDate,
  parseTime,
  quarterRange,
  slotOccurrences,
  timeToMinutes,
  utcToLocalDate,
  utcToLocalTime,
} from './club-calendar';
import { SchedulingRepository } from './scheduling.repository';
import type {
  ScheduleSlotRecord,
  ScheduleTemplateRecord,
  TrainingSessionRecord,
} from './scheduling.repository';

/** Конфликт, обнаруженный при материализации занятий. */
interface GenerationConflict {
  startsAt: string;
  localDate: string;
  localTime: string;
  kind: 'TRAINER_BUSY' | 'HALL_BUSY';
  withGroupName: string;
}

/**
 * Расписание: квартальные шаблоны, материализация занятий, точечные изменения
 * (эпик D).
 *
 * Спецификация: docs/01-mvp-scope.md (квартальный регулярный график), BR-009
 * (точечное изменение экземпляра не меняет шаблон), docs/08-database.md
 * (расчетный период календарными полями), ADR-0009.
 *
 * Ключевая идея: шаблон отвечает на вопрос «как группа занимается регулярно»,
 * занятие — «что происходит в конкретный день». Поэтому правка занятия не
 * трогает шаблон, а правка шаблона не переписывает уже созданные занятия.
 */
@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    private readonly schedule: SchedulingRepository,
    private readonly groups: GroupsRepository,
    private readonly scope: ResourceScopeService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private get timeZone(): string {
    return this.config.get<string>('CLUB_TIMEZONE') ?? 'Asia/Almaty';
  }

  // --- Шаблоны -------------------------------------------------------------

  async listTemplates(
    callerUserId: string,
    filter: { groupId?: string; year?: number } = {},
  ): Promise<ScheduleTemplateView[]> {
    const visibleGroupIds = await this.scope.visibleGroupIds(callerUserId);
    const templates = await this.schedule.listTemplates({ ...filter, visibleGroupIds });
    return templates.map((template) => this.toTemplateView(template));
  }

  async getTemplate(callerUserId: string, templateId: string): Promise<ScheduleTemplateView> {
    const template = await this.requireTemplate(templateId);
    await this.scope.assertGroupAccess(callerUserId, template.groupId);
    return this.toTemplateView(template);
  }

  /**
   * Создает шаблон на квартал.
   *
   * Границы квартала вычисляются календарно, а не из UTC: иначе на границе года
   * или месяца шаблон мог бы получить неверный диапазон.
   */
  async createTemplate(input: CreateScheduleTemplateInput): Promise<ScheduleTemplateView> {
    if (!(await this.groups.exists(input.groupId))) {
      throw new ApiException('GROUP_NOT_FOUND' satisfies ApiErrorCode, 'Группа не найдена', {
        groupId: input.groupId,
      });
    }

    const existing = await this.schedule.findTemplateByPeriod(
      input.groupId,
      input.year,
      input.quarter,
    );
    if (existing) {
      throw new ApiException(
        'SCHEDULE_TEMPLATE_EXISTS' satisfies ApiErrorCode,
        `Расписание на ${input.quarter} квартал ${input.year} года уже создано`,
        { templateId: existing.id },
      );
    }

    const range = quarterRange(input.year, input.quarter);
    const template = await this.schedule.createTemplate({
      groupId: input.groupId,
      year: input.year,
      quarter: input.quarter,
      validFrom: new Date(`${range.from}T00:00:00.000Z`),
      validTo: new Date(`${range.to}T00:00:00.000Z`),
    });

    await this.audit.recordSafely({
      action: AuditAction.SCHEDULE_TEMPLATE_CREATED,
      entityType: AuditEntityType.SCHEDULE_TEMPLATE,
      entityId: template.id,
      after: { groupId: input.groupId, year: input.year, quarter: input.quarter },
    });

    return this.toTemplateView(template);
  }

  /**
   * Публикует шаблон.
   *
   * Публикация требует хотя бы одного слота: пустое расписание, показанное
   * родителям, выглядит как ошибка, а не как решение.
   */
  async publishTemplate(callerUserId: string, templateId: string): Promise<ScheduleTemplateView> {
    const template = await this.requireTemplate(templateId);
    await this.scope.assertGroupAccess(callerUserId, template.groupId);

    if (template.publishedAt) {
      throw new ApiException(
        'SCHEDULE_TEMPLATE_ALREADY_PUBLISHED' satisfies ApiErrorCode,
        'Расписание уже опубликовано',
      );
    }
    if (template.slots.length === 0) {
      throw new ApiException(
        'SCHEDULE_TEMPLATE_EMPTY' satisfies ApiErrorCode,
        'Нельзя опубликовать расписание без занятий: добавьте хотя бы один слот',
      );
    }

    const published = await this.schedule.publishTemplate(templateId, new Date());

    await this.audit.recordSafely({
      action: AuditAction.SCHEDULE_TEMPLATE_PUBLISHED,
      entityType: AuditEntityType.SCHEDULE_TEMPLATE,
      entityId: templateId,
      after: { slots: template.slots.length },
    });

    return this.toTemplateView(published);
  }

  async deleteTemplate(callerUserId: string, templateId: string): Promise<void> {
    const template = await this.requireTemplate(templateId);
    await this.scope.assertGroupAccess(callerUserId, template.groupId);

    if (template.publishedAt) {
      throw new ApiException(
        'SCHEDULE_TEMPLATE_PUBLISHED' satisfies ApiErrorCode,
        'Опубликованное расписание нельзя удалить: измените отдельные занятия',
      );
    }

    await this.schedule.deleteTemplate(templateId);
    await this.audit.recordSafely({
      action: AuditAction.SCHEDULE_TEMPLATE_ARCHIVED,
      entityType: AuditEntityType.SCHEDULE_TEMPLATE,
      entityId: templateId,
      before: { groupId: template.groupId, year: template.year, quarter: template.quarter },
    });
  }

  // --- Слоты ---------------------------------------------------------------

  async addSlot(
    callerUserId: string,
    templateId: string,
    input: AddScheduleSlotInput,
  ): Promise<ScheduleTemplateView> {
    const template = await this.requireTemplate(templateId);
    await this.scope.assertGroupAccess(callerUserId, template.groupId);
    this.assertTemplateEditable(template);
    this.assertTimeRange(input.startTime, input.endTime);
    await this.assertSlotHasNoOverlap(template, {
      weekday: input.weekday,
      startTime: input.startTime,
      endTime: input.endTime,
    });

    const slot = await this.schedule.addSlot({
      templateId,
      weekday: input.weekday,
      startTime: input.startTime,
      endTime: input.endTime,
      hallId: input.hallId ?? null,
      trainerId: input.trainerId ?? null,
    });

    await this.audit.recordSafely({
      action: AuditAction.SCHEDULE_SLOT_ADDED,
      entityType: AuditEntityType.SCHEDULE_TEMPLATE,
      entityId: templateId,
      after: {
        weekday: input.weekday,
        startTime: input.startTime,
        endTime: input.endTime,
        hallId: input.hallId ?? null,
        trainerId: input.trainerId ?? null,
      },
    });

    void slot;
    return this.toTemplateView(await this.requireTemplate(templateId));
  }

  async updateSlot(
    callerUserId: string,
    slotId: string,
    input: UpdateScheduleSlotInput,
  ): Promise<ScheduleTemplateView> {
    const existing = await this.schedule.findSlot(slotId);
    if (!existing) {
      throw new ApiException('SCHEDULE_TEMPLATE_NOT_FOUND' satisfies ApiErrorCode, 'Слот не найден');
    }

    const template = await this.requireTemplateForSlot(slotId);
    await this.scope.assertGroupAccess(callerUserId, template.groupId);
    this.assertTemplateEditable(template);

    const weekday = input.weekday ?? existing.weekday;
    const startTime = input.startTime ?? existing.startTime;
    const endTime = input.endTime ?? existing.endTime;
    this.assertTimeRange(startTime, endTime);
    await this.assertSlotHasNoOverlap(template, { weekday, startTime, endTime }, slotId);

    await this.schedule.updateSlot(slotId, input);
    await this.audit.recordSafely({
      action: AuditAction.SCHEDULE_SLOT_UPDATED,
      entityType: AuditEntityType.SCHEDULE_TEMPLATE,
      entityId: template.id,
      before: {
        weekday: existing.weekday,
        startTime: existing.startTime,
        endTime: existing.endTime,
      },
      after: { weekday, startTime, endTime },
    });

    return this.toTemplateView(await this.requireTemplate(template.id));
  }

  async deleteSlot(callerUserId: string, slotId: string): Promise<ScheduleTemplateView> {
    const existing = await this.schedule.findSlot(slotId);
    if (!existing) {
      throw new ApiException('SCHEDULE_TEMPLATE_NOT_FOUND' satisfies ApiErrorCode, 'Слот не найден');
    }

    const template = await this.requireTemplateForSlot(slotId);
    await this.scope.assertGroupAccess(callerUserId, template.groupId);
    this.assertTemplateEditable(template);

    await this.schedule.deleteSlot(slotId);
    await this.audit.recordSafely({
      action: AuditAction.SCHEDULE_SLOT_REMOVED,
      entityType: AuditEntityType.SCHEDULE_TEMPLATE,
      entityId: template.id,
      before: {
        weekday: existing.weekday,
        startTime: existing.startTime,
        endTime: existing.endTime,
      },
    });

    return this.toTemplateView(await this.requireTemplate(template.id));
  }

  // --- Материализация занятий ---------------------------------------------

  /**
   * Создает занятия квартала из опубликованного шаблона.
   *
   * Конфликты (тренер или зал заняты в то же время в другой группе) не
   * пропускаются молча: иначе клуб узнал бы о накладке от родителей. Ответ
   * содержит конфликтующие даты, чтобы администратор мог поправить слоты.
   */
  async generateSessions(
    callerUserId: string,
    input: GenerateSessionsInput,
  ): Promise<GenerateSessionsResult> {
    const template = await this.requireTemplate(input.templateId);
    await this.scope.assertGroupAccess(callerUserId, template.groupId);

    if (!template.publishedAt) {
      throw new ApiException(
        'SCHEDULE_TEMPLATE_EMPTY' satisfies ApiErrorCode,
        'Сначала опубликуйте расписание: занятия создаются из опубликованного шаблона',
      );
    }
    if (template.slots.length === 0) {
      throw new ApiException(
        'SCHEDULE_TEMPLATE_EMPTY' satisfies ApiErrorCode,
        'В расписании нет ни одного слота',
      );
    }

    const now = new Date();
    const range = quarterRange(template.year, template.quarter);
    let removed = 0;

    if (input.regenerate) {
      removed = await this.schedule.deleteFutureSessions(template.id, now);
    }

    const hallId = await this.groups.findHallId(template.groupId);
    const candidates = template.slots.flatMap((slot) =>
      slotOccurrences(
        range,
        { weekday: slot.weekday, startTime: slot.startTime, endTime: slot.endTime },
        this.timeZone,
      ).map((occurrence) => ({ slot, occurrence })),
    );

    // Прошедшие моменты не материализуются: расписание — план, а не архив.
    const upcoming = candidates.filter((candidate) => candidate.occurrence.startsAt > now);
    const existing = await this.schedule.listSessions({
      from: new Date(`${range.from}T00:00:00.000Z`),
      to: new Date(`${range.to}T23:59:59.999Z`),
    });
    const existingKeys = new Set(
      existing.map((session) => `${session.groupId}|${session.startsAt.toISOString()}`),
    );

    const conflicts = this.findConflicts(template, upcoming, existing);

    // Пересечения не блокируют генерацию (#72): общая тренировка — две группы в
    // одном зале в одно время — нормальный сценарий. Но и молчать нельзя:
    // возвращаем предупреждения, их показывает админка.
    const warnings =
      conflicts.length === 0
        ? []
        : [
            `Пересечения: ${conflicts.length}. Например, ${conflicts[0]?.localDate} в ` +
              `${conflicts[0]?.localTime}: ` +
              `${
                conflicts[0]?.kind === 'TRAINER_BUSY' ? 'тренер уже занят' : 'зал уже занят'
              } в группе «${conflicts[0]?.withGroupName}»`,
          ];

    const toCreate = upcoming
      .filter(
        (candidate) =>
          !existingKeys.has(
            `${template.groupId}|${candidate.occurrence.startsAt.toISOString()}`,
          ),
      )
      .map((candidate) => ({
        groupId: template.groupId,
        // Зал слота важнее зала группы: группа может тренироваться в другом зале.
        hallId: candidate.slot.hallId ?? hallId,
        trainerId: candidate.slot.trainerId,
        scheduleTemplateId: template.id,
        startsAt: candidate.occurrence.startsAt,
        endsAt: candidate.occurrence.endsAt,
      }));

    const created = await this.schedule.createSessions(toCreate);
    const skipped = upcoming.length - created;

    await this.audit.recordSafely({
      action: AuditAction.SCHEDULE_SESSIONS_GENERATED,
      entityType: AuditEntityType.SCHEDULE_TEMPLATE,
      entityId: template.id,
      after: { created, skipped, removed, regenerate: input.regenerate ?? false },
    });

    this.logger.log(
      `Материализация шаблона ${template.id}: создано ${created}, пропущено ${skipped}, удалено ${removed}`,
    );

    return { created, skipped, removed, warnings };
  }

  // --- Занятия -------------------------------------------------------------

  /**
   * Добавляет занятие вручную.
   *
   * Два сценария: занести занятие задним числом (клуб начал работать раньше, чем
   * появилась система) и добавить разовое занятие вне квартального расписания.
   * Такое занятие не связано с шаблоном, поэтому пересоздание расписания его не
   * затрагивает.
   *
   * Время приходит локальным временем клуба и переводится в UTC здесь: иначе
   * администратору пришлось бы самому считать смещение, и он бы ошибался.
   */
  async createSession(input: CreateSessionInput): Promise<TrainingSessionView> {
    if (!(await this.groups.exists(input.groupId))) {
      throw new ApiException('GROUP_NOT_FOUND' satisfies ApiErrorCode, 'Группа не найдена', {
        groupId: input.groupId,
      });
    }

    const { startsAt, endsAt } = this.resolveLocalRange(input.date, input.startTime, input.endTime);

    if (endsAt <= startsAt) {
      throw new ApiException(
        'SCHEDULE_SLOT_INVALID_TIME' satisfies ApiErrorCode,
        'Окончание занятия должно быть позже начала',
      );
    }

    // Занятие задним числом может пересекаться с уже созданными: в прошлом
    // расписание часто велось иначе. Накладку в будущем не допускаем.
    if (startsAt.getTime() > Date.now()) {
      const neighbour = await this.findOverlappingSession({
        groupId: input.groupId,
        startsAt,
        endsAt,
        hallId: input.hallId ?? null,
        trainerId: input.trainerId ?? null,
      });
      if (neighbour) {
        throw new ApiException(
          'TRAINING_SESSION_CONFLICT' satisfies ApiErrorCode,
          `В это время уже есть занятие группы «${neighbour.groupName}»`,
          { sessionId: neighbour.id },
        );
      }
    }

    const groupHallId = await this.groups.findHallId(input.groupId);

    let session: TrainingSessionRecord;
    try {
      session = await this.schedule.createSession({
        groupId: input.groupId,
        hallId: input.hallId ?? groupHallId,
        trainerId: input.trainerId ?? null,
        scheduleTemplateId: null,
        startsAt,
        endsAt,
        changeReason: input.reason,
      });
    } catch (error) {
      // В базе занятие группы уникально по времени начала. Повторная попытка
      // занести то же занятие — не ошибка сервера: администратор просто дважды
      // нажал кнопку или заносит историю повторно.
      if (isUniqueViolation(error)) {
        throw new ApiException(
          'TRAINING_SESSION_DUPLICATE' satisfies ApiErrorCode,
          'Занятие этой группы на это время уже есть',
          { groupId: input.groupId, startsAt: startsAt.toISOString() },
        );
      }
      throw error;
    }

    await this.audit.recordSafely({
      action: AuditAction.SCHEDULE_SESSION_CREATED,
      entityType: AuditEntityType.TRAINING_SESSION,
      entityId: session.id,
      after: {
        groupId: input.groupId,
        startsAt: startsAt.toISOString(),
        localDate: input.date,
        localTime: input.startTime,
        manual: true,
        reason: input.reason,
      },
    });

    this.logger.log(
      `Занятие добавлено вручную: ${input.date} ${input.startTime} (группа ${input.groupId})`,
    );

    return this.toSessionView(session);
  }

  /** Локальные дату и время клуба превращает в UTC-интервал. */
  private resolveLocalRange(
    date: string,
    startTime: string,
    endTime: string,
  ): { startsAt: Date; endsAt: Date } {
    let parsed: { year: number; month: number; day: number };
    let start: { hour: number; minute: number };
    let end: { hour: number; minute: number };

    try {
      parsed = parseCalendarDate(date);
      start = parseTime(startTime);
      end = parseTime(endTime);
    } catch (error) {
      throw new ApiException(
        'SCHEDULE_SLOT_INVALID_TIME' satisfies ApiErrorCode,
        error instanceof Error ? error.message : 'Некорректная дата или время',
      );
    }

    const startsAt = localToUtc(
      {
        year: parsed.year,
        month: parsed.month,
        day: parsed.day,
        hour: start.hour,
        minute: start.minute,
      },
      this.timeZone,
    );

    const startMinutes = start.hour * 60 + start.minute;
    const endMinutes = end.hour * 60 + end.minute;
    // Окончание раньше начала означает занятие через полночь.
    const duration =
      endMinutes > startMinutes ? endMinutes - startMinutes : 24 * 60 - startMinutes + endMinutes;

    return { startsAt, endsAt: new Date(startsAt.getTime() + duration * 60_000) };
  }

  /** Ищет занятие, пересекающееся по времени в той же группе, зале или у тренера. */
  private async findOverlappingSession(candidate: {
    groupId: string;
    startsAt: Date;
    endsAt: Date;
    hallId: string | null;
    trainerId: string | null;
  }): Promise<TrainingSessionRecord | null> {
    const neighbours = await this.schedule.listSessions({
      from: new Date(candidate.startsAt.getTime() - 12 * 3_600_000),
      to: new Date(candidate.endsAt.getTime() + 12 * 3_600_000),
    });

    for (const neighbour of neighbours) {
      if (neighbour.status === PrismaSessionStatus.CANCELLED) {
        continue;
      }
      const overlap = intervalsOverlap(
        { start: candidate.startsAt.getTime(), end: candidate.endsAt.getTime() },
        { start: neighbour.startsAt.getTime(), end: neighbour.endsAt.getTime() },
      );
      if (!overlap) {
        continue;
      }

      if (neighbour.groupId === candidate.groupId) {
        return neighbour;
      }
      if (candidate.trainerId && neighbour.trainerId === candidate.trainerId) {
        return neighbour;
      }
      if (candidate.hallId && neighbour.hallId === candidate.hallId) {
        return neighbour;
      }
    }

    return null;
  }

  async listSessions(
    callerUserId: string,
    query: ListSessionsQuery,
  ): Promise<TrainingSessionView[]> {
    const visibleGroupIds = await this.scope.visibleGroupIds(callerUserId);
    const now = new Date();
    const from = query.from ? new Date(query.from) : new Date(now.getTime() - 7 * 86_400_000);
    const to = query.to ? new Date(query.to) : new Date(now.getTime() + 30 * 86_400_000);

    const sessions = await this.schedule.listSessions({
      from,
      to,
      groupId: query.groupId,
      trainerId: query.trainerId,
      status: query.status as PrismaSessionStatus | undefined,
      visibleGroupIds,
    });

    return sessions.map((session) => this.toSessionView(session));
  }

  async getSession(callerUserId: string, sessionId: string): Promise<TrainingSessionView> {
    const session = await this.requireSession(sessionId);
    await this.scope.assertGroupAccess(callerUserId, session.groupId);
    return this.toSessionView(session);
  }

  /**
   * Перенос занятия (BR-009).
   *
   * Меняется только экземпляр: шаблон остается прежним, поэтому следующая
   * неделя пройдет по расписанию. Причина обязательна — родитель должен
   * понимать, почему занятие переехало.
   */
  async moveSession(
    callerUserId: string,
    sessionId: string,
    input: MoveSessionInput,
  ): Promise<TrainingSessionView> {
    const session = await this.requireSession(sessionId);
    await this.scope.assertGroupAccess(callerUserId, session.groupId);
    this.assertSessionEditable(session);

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (!(startsAt < endsAt)) {
      throw new ApiException(
        'SCHEDULE_SLOT_INVALID_TIME' satisfies ApiErrorCode,
        'Окончание занятия должно быть позже начала',
      );
    }

    const trainerId = input.trainerId === undefined ? session.trainerId : input.trainerId;
    const hallId = input.hallId === undefined ? session.hallId : input.hallId;
    await this.assertSessionResourcesFree(session, { startsAt, endsAt, trainerId, hallId });

    const updated = await this.schedule.updateFutureSession(sessionId, new Date(), {
      startsAt,
      endsAt,
      hallId,
      trainerId,
      status: PrismaSessionStatus.MOVED,
      changeReason: input.reason,
    });

    if (!updated) {
      throw new ApiException(
        'SESSION_ALREADY_STARTED' satisfies ApiErrorCode,
        'Занятие уже началось: расписание прошедших занятий не меняется',
      );
    }

    await this.audit.recordSafely({
      action: AuditAction.SCHEDULE_SESSION_MOVED,
      entityType: AuditEntityType.TRAINING_SESSION,
      entityId: sessionId,
      before: { startsAt: session.startsAt.toISOString(), hallId: session.hallId },
      after: { startsAt: startsAt.toISOString(), hallId, reason: input.reason },
    });

    return this.toSessionView(updated);
  }

  /** Отмена занятия: шаблон не меняется, занятие остается в истории. */
  async cancelSession(
    callerUserId: string,
    sessionId: string,
    input: CancelSessionInput,
  ): Promise<TrainingSessionView> {
    const session = await this.requireSession(sessionId);
    await this.scope.assertGroupAccess(callerUserId, session.groupId);

    if (session.status === PrismaSessionStatus.CANCELLED) {
      throw new ApiException(
        'TRAINING_SESSION_CANCELLED' satisfies ApiErrorCode,
        'Занятие уже отменено',
      );
    }
    this.assertSessionEditable(session);

    const updated = await this.schedule.updateFutureSession(sessionId, new Date(), {
      status: PrismaSessionStatus.CANCELLED,
      changeReason: input.reason,
      cancelledAt: new Date(),
      cancelledById: callerUserId,
    });

    if (!updated) {
      throw new ApiException(
        'SESSION_ALREADY_STARTED' satisfies ApiErrorCode,
        'Занятие уже началось: отменить его нельзя, отметьте посещаемость',
      );
    }

    await this.audit.recordSafely({
      action: AuditAction.SCHEDULE_SESSION_CANCELLED,
      entityType: AuditEntityType.TRAINING_SESSION,
      entityId: sessionId,
      before: { startsAt: session.startsAt.toISOString() },
      after: { reason: input.reason },
    });

    return this.toSessionView(updated);
  }

  // --- Проверки ------------------------------------------------------------

  private assertTemplateEditable(template: ScheduleTemplateRecord): void {
    if (template.publishedAt) {
      throw new ApiException(
        'SCHEDULE_TEMPLATE_PUBLISHED' satisfies ApiErrorCode,
        'Расписание опубликовано: измените отдельные занятия либо создайте шаблон на новый квартал',
      );
    }
  }

  private assertTimeRange(startTime: string, endTime: string): void {
    if (timeToMinutes(startTime) === timeToMinutes(endTime)) {
      throw new ApiException(
        'SCHEDULE_SLOT_INVALID_TIME' satisfies ApiErrorCode,
        'Начало и окончание занятия совпадают',
      );
    }
  }

  /** В одном шаблоне занятия не должны накладываться друг на друга. */
  private async assertSlotHasNoOverlap(
    template: ScheduleTemplateRecord,
    candidate: { weekday: Weekday; startTime: string; endTime: string },
    excludeSlotId?: string,
  ): Promise<void> {
    const candidateStart = timeToMinutes(candidate.startTime);
    const candidateEnd = timeToMinutes(candidate.endTime);

    for (const slot of template.slots) {
      if (slot.id === excludeSlotId || slot.weekday !== candidate.weekday) {
        continue;
      }

      const overlap = intervalsOverlap(
        { start: candidateStart, end: normalizeEnd(candidateStart, candidateEnd) },
        { start: timeToMinutes(slot.startTime), end: normalizeEnd(timeToMinutes(slot.startTime), timeToMinutes(slot.endTime)) },
      );

      if (overlap) {
        throw new ApiException(
          'SLOT_OVERLAPS_TEMPLATE' satisfies ApiErrorCode,
          `Время пересекается со слотом ${WEEKDAY_LABELS[slot.weekday]} ${slot.startTime}–${slot.endTime}`,
          { slotId: slot.id },
        );
      }
    }
  }

  /**
   * Конфликты материализации: тренер и зал не могут быть в двух группах
   * одновременно. Внутри одной группы накладок быть не может — это проверяется
   * при добавлении слота.
   */
  private findConflicts(
    template: ScheduleTemplateRecord,
    upcoming: { slot: ScheduleSlotRecord; occurrence: { startsAt: Date; endsAt: Date } }[],
    existing: TrainingSessionRecord[],
  ): GenerationConflict[] {
    const relevant = existing.filter(
      (session) =>
        session.groupId !== template.groupId && session.status !== PrismaSessionStatus.CANCELLED,
    );

    const conflicts: GenerationConflict[] = [];

    for (const candidate of upcoming) {
      for (const session of relevant) {
        const overlap = intervalsOverlap(
          { start: candidate.occurrence.startsAt.getTime(), end: candidate.occurrence.endsAt.getTime() },
          { start: session.startsAt.getTime(), end: session.endsAt.getTime() },
        );
        if (!overlap) {
          continue;
        }

        const trainerBusy =
          candidate.slot.trainerId !== null && candidate.slot.trainerId === session.trainerId;
        const hallBusy = candidate.slot.hallId !== null && candidate.slot.hallId === session.hallId;

        if (trainerBusy || hallBusy) {
          conflicts.push({
            startsAt: candidate.occurrence.startsAt.toISOString(),
            localDate: utcToLocalDate(candidate.occurrence.startsAt, this.timeZone),
            localTime: utcToLocalTime(candidate.occurrence.startsAt, this.timeZone),
            kind: trainerBusy ? 'TRAINER_BUSY' : 'HALL_BUSY',
            withGroupName: session.groupName,
          });
          break;
        }
      }
    }

    return conflicts;
  }

  private assertSessionEditable(session: TrainingSessionRecord): void {
    if (session.startsAt.getTime() <= Date.now()) {
      throw new ApiException(
        'SESSION_ALREADY_STARTED' satisfies ApiErrorCode,
        'Занятие уже началось: расписание прошедших занятий не меняется',
      );
    }
  }

  /** Занятость тренера и зала в новом интервале. */
  private async assertSessionResourcesFree(
    session: TrainingSessionRecord,
    candidate: {
      startsAt: Date;
      endsAt: Date;
      trainerId: string | null;
      hallId: string | null;
    },
  ): Promise<void> {
    const neighbours = await this.schedule.listSessions({
      from: new Date(candidate.startsAt.getTime() - 12 * 3_600_000),
      to: new Date(candidate.endsAt.getTime() + 12 * 3_600_000),
    });

    for (const neighbour of neighbours) {
      if (neighbour.id === session.id || neighbour.status === PrismaSessionStatus.CANCELLED) {
        continue;
      }

      const overlap = intervalsOverlap(
        { start: candidate.startsAt.getTime(), end: candidate.endsAt.getTime() },
        { start: neighbour.startsAt.getTime(), end: neighbour.endsAt.getTime() },
      );
      if (!overlap) {
        continue;
      }

      if (neighbour.groupId === session.groupId) {
        throw new ApiException(
          'TRAINING_SESSION_CONFLICT' satisfies ApiErrorCode,
          `В это время у группы уже есть занятие (${utcToLocalTime(neighbour.startsAt, this.timeZone)})`,
          { sessionId: neighbour.id },
        );
      }
      if (candidate.trainerId && neighbour.trainerId === candidate.trainerId) {
        throw new ApiException(
          'TRAINER_BUSY' satisfies ApiErrorCode,
          `Тренер занят в это время в группе «${neighbour.groupName}»`,
          { sessionId: neighbour.id },
        );
      }
      if (candidate.hallId && neighbour.hallId === candidate.hallId) {
        throw new ApiException(
          'HALL_BUSY' satisfies ApiErrorCode,
          `Зал занят в это время группой «${neighbour.groupName}»`,
          { sessionId: neighbour.id },
        );
      }
    }
  }

  private async requireTemplate(templateId: string): Promise<ScheduleTemplateRecord> {
    const template = await this.schedule.findTemplate(templateId);
    if (!template) {
      throw new ApiException(
        'SCHEDULE_TEMPLATE_NOT_FOUND' satisfies ApiErrorCode,
        'Расписание не найдено',
      );
    }
    return template;
  }

  /** Шаблон по слоту: слот не хранит группу, она нужна для проверки scope. */
  private async requireTemplateForSlot(slotId: string): Promise<ScheduleTemplateRecord> {
    const link = await this.schedule.findTemplateBySlot(slotId);
    if (!link) {
      throw new ApiException('SCHEDULE_TEMPLATE_NOT_FOUND' satisfies ApiErrorCode, 'Слот не найден');
    }

    const template = await this.schedule.findTemplate(link.templateId);
    if (!template) {
      throw new ApiException(
        'SCHEDULE_TEMPLATE_NOT_FOUND' satisfies ApiErrorCode,
        'Расписание не найдено',
      );
    }
    return template;
  }

  private async requireSession(sessionId: string): Promise<TrainingSessionRecord> {
    const session = await this.schedule.findSession(sessionId);
    if (!session) {
      throw new ApiException(
        'TRAINING_SESSION_NOT_FOUND' satisfies ApiErrorCode,
        'Занятие не найдено',
      );
    }
    return session;
  }

  private toTemplateView(template: ScheduleTemplateRecord): ScheduleTemplateView {
    return {
      id: template.id,
      groupId: template.groupId,
      groupName: template.groupName,
      year: template.year,
      quarter: template.quarter,
      validFrom: template.validFrom.toISOString().slice(0, 10),
      validTo: template.validTo.toISOString().slice(0, 10),
      publishedAt: template.publishedAt ? template.publishedAt.toISOString() : null,
      slots: template.slots.map(toSlotView),
    };
  }

  private toSessionView(session: TrainingSessionRecord): TrainingSessionView {
    return {
      id: session.id,
      groupId: session.groupId,
      groupName: session.groupName,
      hallId: session.hallId,
      hallName: session.hallName,
      trainerId: session.trainerId,
      trainerName: session.trainerName,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      status: session.status as TrainingSessionStatus,
      changeReason: session.changeReason,
      cancelledAt: session.cancelledAt ? session.cancelledAt.toISOString() : null,
      fromTemplate: session.scheduleTemplateId !== null,
    };
  }
}

/** Окончание раньше начала означает занятие через полночь. */
function normalizeEnd(start: number, end: number): number {
  return end > start ? end : end + 24 * 60;
}

function toSlotView(slot: ScheduleSlotRecord): ScheduleSlotView {
  return {
    id: slot.id,
    weekday: slot.weekday as Weekday,
    startTime: slot.startTime,
    endTime: slot.endTime,
    hallId: slot.hallId,
    hallName: slot.hallName,
    trainerId: slot.trainerId,
    trainerName: slot.trainerName,
  };
}

/**
 * Нарушение уникального ограничения.
 *
 * Проверяется по коду и имени, а не через `instanceof PrismaClientKnownRequestError`:
 * класс приходит из сгенерированного клиента, и при его пересборке `instanceof`
 * может перестать совпадать, а код ошибки остается стабильным.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
