import { ConfigService } from '@nestjs/config';

import { AuditService } from '../audit/audit.service';
import type { GroupsRepository } from '../groups/groups.repository';
import { ResourceScopeService } from '../identity/resource-scope.service';
import type {
  ScheduleSlotRecord,
  ScheduleTemplateRecord,
  SchedulingRepository,
  TrainingSessionRecord,
} from './scheduling.repository';
import { SchedulingService } from './scheduling.service';

const TIME_ZONE = 'Asia/Almaty';

const slot: ScheduleSlotRecord = {
  id: 'slot-1',
  weekday: 'WEDNESDAY',
  startTime: '18:00',
  endTime: '19:30',
  hallId: 'hall-1',
  hallName: 'Основной зал',
  trainerId: 'trainer-1',
  trainerName: 'Тренер Серик',
};

const template: ScheduleTemplateRecord = {
  id: 'template-1',
  groupId: 'group-1',
  groupName: 'Дети 7-9 лет',
  year: 2026,
  quarter: 1,
  validFrom: new Date('2026-01-01T00:00:00.000Z'),
  validTo: new Date('2026-03-31T00:00:00.000Z'),
  publishedAt: null,
  slots: [slot],
};

const publishedTemplate: ScheduleTemplateRecord = {
  ...template,
  publishedAt: new Date('2025-12-20T10:00:00.000Z'),
};

const session: TrainingSessionRecord = {
  id: 'session-1',
  groupId: 'group-1',
  groupName: 'Дети 7-9 лет',
  branchId: 'branch-1',
  hallId: 'hall-1',
  hallName: 'Основной зал',
  trainerId: 'trainer-1',
  trainerName: 'Тренер Серик',
  startsAt: new Date('2026-03-04T13:00:00.000Z'),
  endsAt: new Date('2026-03-04T14:30:00.000Z'),
  status: 'SCHEDULED',
  changeReason: null,
  cancelledAt: null,
  scheduleTemplateId: 'template-1',
};

describe('SchedulingService', () => {
  let repository: jest.Mocked<SchedulingRepository>;
  let groups: { exists: jest.Mock; findPrimaryBranchId: jest.Mock };
  let scope: { visibleGroupIds: jest.Mock; assertGroupAccess: jest.Mock };
  let audit: { recordSafely: jest.Mock };
  let service: SchedulingService;

  beforeEach(() => {
    repository = {
      findTemplateByPeriod: jest.fn().mockResolvedValue(null),
      findTemplate: jest.fn().mockResolvedValue(template),
      listTemplates: jest.fn().mockResolvedValue([template]),
      createTemplate: jest.fn().mockResolvedValue(template),
      publishTemplate: jest.fn().mockResolvedValue(publishedTemplate),
      deleteTemplate: jest.fn().mockResolvedValue(undefined),
      addSlot: jest.fn().mockResolvedValue(slot),
      findSlot: jest.fn().mockResolvedValue(slot),
      findTemplateBySlot: jest
        .fn()
        .mockResolvedValue({ templateId: 'template-1', groupId: 'group-1' }),
      updateSlot: jest.fn().mockResolvedValue(slot),
      deleteSlot: jest.fn().mockResolvedValue(true),
      listSessions: jest.fn().mockResolvedValue([]),
      findSession: jest.fn().mockResolvedValue(session),
      countStartedSessions: jest.fn().mockResolvedValue(0),
      deleteFutureSessions: jest.fn().mockResolvedValue(0),
      createSessions: jest.fn().mockImplementation((input: unknown[]) => input.length),
      updateSession: jest.fn().mockResolvedValue(session),
      updateFutureSession: jest.fn().mockResolvedValue(session),
    } as unknown as jest.Mocked<SchedulingRepository>;

    groups = {
      exists: jest.fn().mockResolvedValue(true),
      findPrimaryBranchId: jest.fn().mockResolvedValue('branch-1'),
    };

    scope = {
      visibleGroupIds: jest.fn().mockResolvedValue(null),
      assertGroupAccess: jest.fn().mockResolvedValue({ allowed: true, reason: 'role_superadmin' }),
    };

    audit = { recordSafely: jest.fn().mockResolvedValue(null) };

    service = new SchedulingService(
      repository,
      groups as unknown as GroupsRepository,
      scope as unknown as ResourceScopeService,
      audit as unknown as AuditService,
      { get: jest.fn().mockReturnValue(TIME_ZONE) } as unknown as ConfigService,
    );
  });

  describe('шаблоны', () => {
    it('создает шаблон с календарными границами квартала', async () => {
      await service.createTemplate({ groupId: 'group-1', year: 2026, quarter: 1 });

      expect(repository.createTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          groupId: 'group-1',
          year: 2026,
          quarter: 1,
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
          validTo: new Date('2026-03-31T00:00:00.000Z'),
        }),
      );
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'schedule.template_created' }),
      );
    });

    it('отклоняет второй шаблон на тот же квартал', async () => {
      repository.findTemplateByPeriod.mockResolvedValue(template);

      await expect(
        service.createTemplate({ groupId: 'group-1', year: 2026, quarter: 1 }),
      ).rejects.toMatchObject({ code: 'SCHEDULE_TEMPLATE_EXISTS' });
      expect(repository.createTemplate).not.toHaveBeenCalled();
    });

    it('отклоняет шаблон для несуществующей группы', async () => {
      groups.exists.mockResolvedValue(false);

      await expect(
        service.createTemplate({ groupId: 'ghost', year: 2026, quarter: 1 }),
      ).rejects.toMatchObject({ code: 'GROUP_NOT_FOUND' });
    });

    it('ограничивает список шаблонов зоной видимости', async () => {
      scope.visibleGroupIds.mockResolvedValue(['group-1']);

      await service.listTemplates('coach-1');

      expect(repository.listTemplates).toHaveBeenCalledWith(
        expect.objectContaining({ visibleGroupIds: ['group-1'] }),
      );
    });

    it('публикует шаблон с занятиями', async () => {
      await service.publishTemplate('admin-1', 'template-1');

      expect(repository.publishTemplate).toHaveBeenCalledWith('template-1', expect.any(Date));
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'schedule.template_published' }),
      );
    });

    it('не публикует пустой шаблон', async () => {
      repository.findTemplate.mockResolvedValue({ ...template, slots: [] });

      await expect(service.publishTemplate('admin-1', 'template-1')).rejects.toMatchObject({
        code: 'SCHEDULE_TEMPLATE_EMPTY',
      });
    });

    it('не публикует повторно', async () => {
      repository.findTemplate.mockResolvedValue(publishedTemplate);

      await expect(service.publishTemplate('admin-1', 'template-1')).rejects.toMatchObject({
        code: 'SCHEDULE_TEMPLATE_ALREADY_PUBLISHED',
      });
    });

    it('не удаляет опубликованный шаблон', async () => {
      repository.findTemplate.mockResolvedValue(publishedTemplate);

      await expect(service.deleteTemplate('admin-1', 'template-1')).rejects.toMatchObject({
        code: 'SCHEDULE_TEMPLATE_PUBLISHED',
      });
      expect(repository.deleteTemplate).not.toHaveBeenCalled();
    });
  });

  describe('слоты', () => {
    it('добавляет слот в неопубликованный шаблон', async () => {
      await service.addSlot('admin-1', 'template-1', {
        weekday: 'FRIDAY',
        startTime: '10:00',
        endTime: '11:30',
      });

      expect(repository.addSlot).toHaveBeenCalledWith(
        expect.objectContaining({ weekday: 'FRIDAY', startTime: '10:00', endTime: '11:30' }),
      );
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'schedule.slot_added' }),
      );
    });

    it('не меняет слоты опубликованного шаблона', async () => {
      repository.findTemplate.mockResolvedValue(publishedTemplate);

      await expect(
        service.addSlot('admin-1', 'template-1', {
          weekday: 'FRIDAY',
          startTime: '10:00',
          endTime: '11:30',
        }),
      ).rejects.toMatchObject({ code: 'SCHEDULE_TEMPLATE_PUBLISHED' });
      expect(repository.addSlot).not.toHaveBeenCalled();
    });

    it('отклоняет совпадающее начало и окончание', async () => {
      await expect(
        service.addSlot('admin-1', 'template-1', {
          weekday: 'FRIDAY',
          startTime: '10:00',
          endTime: '10:00',
        }),
      ).rejects.toMatchObject({ code: 'SCHEDULE_SLOT_INVALID_TIME' });
    });

    it('отклоняет слот, пересекающийся с существующим', async () => {
      // Существующий слот: среда 18:00–19:30.
      await expect(
        service.addSlot('admin-1', 'template-1', {
          weekday: 'WEDNESDAY',
          startTime: '19:00',
          endTime: '20:00',
        }),
      ).rejects.toMatchObject({ code: 'SCHEDULE_SLOT_OVERLAPS' });
      expect(repository.addSlot).not.toHaveBeenCalled();
    });

    it('разрешает слот сразу после существующего', async () => {
      await service.addSlot('admin-1', 'template-1', {
        weekday: 'WEDNESDAY',
        startTime: '19:30',
        endTime: '20:30',
      });

      expect(repository.addSlot).toHaveBeenCalled();
    });

    it('не считает пересечением другой день недели', async () => {
      await service.addSlot('admin-1', 'template-1', {
        weekday: 'THURSDAY',
        startTime: '18:00',
        endTime: '19:30',
      });

      expect(repository.addSlot).toHaveBeenCalled();
    });

    it('исключает сам слот при проверке пересечения при изменении', async () => {
      await service.updateSlot('admin-1', 'slot-1', { startTime: '18:30' });

      expect(repository.updateSlot).toHaveBeenCalledWith('slot-1', { startTime: '18:30' });
    });

    it('отдает 404 для неизвестного слота', async () => {
      repository.findSlot.mockResolvedValue(null);

      await expect(service.deleteSlot('admin-1', 'ghost')).rejects.toMatchObject({
        code: 'SCHEDULE_SLOT_NOT_FOUND',
      });
    });
  });

  describe('материализация занятий', () => {
    /**
     * Материализация зависит от «сейчас»: прошедшие моменты не создаются.
     * Поэтому время фиксируется, иначе тест ломался бы по календарю.
     */
    const NOW = new Date('2026-01-15T00:00:00.000Z');
    /** Ближайшая среда после NOW: 2026-01-21, 18:00 Алматы = 13:00 UTC. */
    const NEXT_WEDNESDAY = new Date('2026-01-21T13:00:00.000Z');

    beforeEach(() => {
      jest.useFakeTimers({ now: NOW });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('не материализует неопубликованный шаблон', async () => {
      await expect(
        service.generateSessions('admin-1', { templateId: 'template-1' }),
      ).rejects.toMatchObject({ code: 'SCHEDULE_TEMPLATE_EMPTY' });
      expect(repository.createSessions).not.toHaveBeenCalled();
    });

    it('создает занятия только на будущие даты квартала', async () => {
      repository.findTemplate.mockResolvedValue(publishedTemplate);

      const result = await service.generateSessions('admin-1', { templateId: 'template-1' });

      const [created] = repository.createSessions.mock.calls[0] as [
        { startsAt: Date; endsAt: Date }[],
      ];

      // В первом квартале 12 сред; 7 и 14 января уже прошли относительно NOW,
      // поэтому создаются 10 занятий: 21 и 28 января, четыре в феврале и четыре
      // в марте.
      expect(created).toHaveLength(10);
      expect(result.created).toBe(10);

      // Первое занятие — ближайшая будущая среда, время локальное 18:00.
      expect(created[0]?.startsAt.toISOString()).toBe(NEXT_WEDNESDAY.toISOString());
      expect(created[0]?.endsAt.toISOString()).toBe('2026-01-21T14:30:00.000Z');

      for (const candidate of created) {
        expect(candidate.startsAt.getTime()).toBeGreaterThan(NOW.getTime());
      }
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'schedule.sessions_generated' }),
      );
    });

    it('берет основной филиал группы для занятий', async () => {
      repository.findTemplate.mockResolvedValue(publishedTemplate);

      await service.generateSessions('admin-1', { templateId: 'template-1' });

      const [created] = repository.createSessions.mock.calls[0] as [
        { branchId: string | null; hallId: string | null; trainerId: string | null }[],
      ];
      for (const candidate of created) {
        expect(candidate.branchId).toBe('branch-1');
        expect(candidate.hallId).toBe('hall-1');
        expect(candidate.trainerId).toBe('trainer-1');
      }
    });

    it('не создает дубли: занятие на это время уже есть', async () => {
      repository.findTemplate.mockResolvedValue(publishedTemplate);
      repository.listSessions.mockResolvedValue([
        {
          ...session,
          startsAt: NEXT_WEDNESDAY,
          endsAt: new Date(NEXT_WEDNESDAY.getTime() + 5_400_000),
        },
      ]);

      const result = await service.generateSessions('admin-1', { templateId: 'template-1' });

      const [created] = repository.createSessions.mock.calls[0] as [{ startsAt: Date }[]];
      expect(created).toHaveLength(9);
      expect(
        created.some((candidate) => candidate.startsAt.getTime() === NEXT_WEDNESDAY.getTime()),
      ).toBe(false);
      expect(result.skipped).toBe(1);
    });

    it('отклоняет генерацию при занятости тренера в другой группе', async () => {
      repository.findTemplate.mockResolvedValue(publishedTemplate);
      repository.listSessions.mockResolvedValue([
        {
          ...session,
          id: 'session-other',
          groupId: 'group-2',
          groupName: 'Другая группа',
          startsAt: new Date(NEXT_WEDNESDAY.getTime() + 1_800_000),
          endsAt: new Date(NEXT_WEDNESDAY.getTime() + 7_200_000),
        },
      ]);

      await expect(
        service.generateSessions('admin-1', { templateId: 'template-1' }),
      ).rejects.toMatchObject({ code: 'TRAINING_SESSION_CONFLICT' });
      expect(repository.createSessions).not.toHaveBeenCalled();
    });

    it('отклоняет генерацию при занятости зала в другой группе', async () => {
      repository.findTemplate.mockResolvedValue(publishedTemplate);
      repository.listSessions.mockResolvedValue([
        {
          ...session,
          id: 'session-other',
          groupId: 'group-2',
          groupName: 'Другая группа',
          trainerId: 'trainer-9',
          startsAt: new Date(NEXT_WEDNESDAY.getTime() + 1_800_000),
          endsAt: new Date(NEXT_WEDNESDAY.getTime() + 7_200_000),
        },
      ]);

      await expect(
        service.generateSessions('admin-1', { templateId: 'template-1' }),
      ).rejects.toMatchObject({ code: 'TRAINING_SESSION_CONFLICT' });
    });

    it('не считает конфликтом отмененное занятие', async () => {
      repository.findTemplate.mockResolvedValue(publishedTemplate);
      repository.listSessions.mockResolvedValue([
        {
          ...session,
          id: 'session-other',
          groupId: 'group-2',
          status: 'CANCELLED',
          startsAt: new Date(NEXT_WEDNESDAY.getTime() + 1_800_000),
          endsAt: new Date(NEXT_WEDNESDAY.getTime() + 7_200_000),
        },
      ]);

      await service.generateSessions('admin-1', { templateId: 'template-1' });

      expect(repository.createSessions).toHaveBeenCalled();
    });

    it('при пересоздании удаляет только будущие занятия', async () => {
      repository.findTemplate.mockResolvedValue(publishedTemplate);
      repository.deleteFutureSessions.mockResolvedValue(7);

      const result = await service.generateSessions('admin-1', {
        templateId: 'template-1',
        regenerate: true,
      });

      expect(repository.deleteFutureSessions).toHaveBeenCalledWith('template-1', NOW);
      expect(result.removed).toBe(7);
    });

    it('не удаляет занятия без флага пересоздания', async () => {
      repository.findTemplate.mockResolvedValue(publishedTemplate);

      await service.generateSessions('admin-1', { templateId: 'template-1' });

      expect(repository.deleteFutureSessions).not.toHaveBeenCalled();
    });
  });

  describe('занятия', () => {
    it('переносит занятие с причиной и помечает статус', async () => {
      // Занятие в будущем: перенос разрешен.
      repository.findSession.mockResolvedValue({
        ...session,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 86_400_000 + 5_400_000),
      });

      await service.moveSession('admin-1', 'session-1', {
        startsAt: new Date(Date.now() + 172_800_000).toISOString(),
        endsAt: new Date(Date.now() + 172_800_000 + 5_400_000).toISOString(),
        reason: 'Карантин в школе',
      });

      expect(repository.updateFutureSession).toHaveBeenCalledWith(
        'session-1',
        expect.any(Date),
        expect.objectContaining({ status: 'MOVED', changeReason: 'Карантин в школе' }),
      );
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'schedule.session_moved' }),
      );
    });

    it('не переносит прошедшее занятие', async () => {
      repository.findSession.mockResolvedValue({
        ...session,
        startsAt: new Date(Date.now() - 86_400_000),
        endsAt: new Date(Date.now() - 86_400_000 + 5_400_000),
      });

      await expect(
        service.moveSession('admin-1', 'session-1', {
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 5_400_000).toISOString(),
          reason: 'Причина',
        }),
      ).rejects.toMatchObject({ code: 'SESSION_ALREADY_STARTED' });
    });

    it('отклоняет перенос с окончанием раньше начала', async () => {
      repository.findSession.mockResolvedValue({
        ...session,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 86_400_000 + 5_400_000),
      });

      await expect(
        service.moveSession('admin-1', 'session-1', {
          startsAt: new Date(Date.now() + 172_800_000).toISOString(),
          endsAt: new Date(Date.now() + 172_800_000 - 3_600_000).toISOString(),
          reason: 'Причина',
        }),
      ).rejects.toMatchObject({ code: 'SCHEDULE_SLOT_INVALID_TIME' });
    });

    it('отклоняет перенос на время, занятое другой группой у того же тренера', async () => {
      const future = new Date(Date.now() + 86_400_000);
      repository.findSession.mockResolvedValue({
        ...session,
        startsAt: future,
        endsAt: new Date(future.getTime() + 5_400_000),
      });
      repository.listSessions.mockResolvedValue([
        {
          ...session,
          id: 'session-other',
          groupId: 'group-2',
          groupName: 'Другая группа',
          startsAt: new Date(future.getTime() + 3_600_000),
          endsAt: new Date(future.getTime() + 9_000_000),
        },
      ]);

      await expect(
        service.moveSession('admin-1', 'session-1', {
          startsAt: new Date(future.getTime() + 3_600_000).toISOString(),
          endsAt: new Date(future.getTime() + 9_000_000).toISOString(),
          reason: 'Причина',
        }),
      ).rejects.toMatchObject({ code: 'TRAINER_BUSY' });
    });

    it('отменяет занятие с причиной', async () => {
      const future = new Date(Date.now() + 86_400_000);
      repository.findSession.mockResolvedValue({
        ...session,
        startsAt: future,
        endsAt: new Date(future.getTime() + 5_400_000),
      });
      repository.updateFutureSession.mockResolvedValue({
        ...session,
        status: 'CANCELLED',
        changeReason: 'Низкая температура',
      });

      const result = await service.cancelSession('admin-1', 'session-1', {
        reason: 'Низкая температура',
      });

      expect(repository.updateFutureSession).toHaveBeenCalledWith(
        'session-1',
        expect.any(Date),
        expect.objectContaining({ status: 'CANCELLED', cancelledById: 'admin-1' }),
      );
      expect(result.status).toBe('CANCELLED');
    });

    it('не отменяет уже отмененное занятие', async () => {
      repository.findSession.mockResolvedValue({
        ...session,
        status: 'CANCELLED',
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 86_400_000 + 5_400_000),
      });

      await expect(
        service.cancelSession('admin-1', 'session-1', { reason: 'Причина' }),
      ).rejects.toMatchObject({ code: 'TRAINING_SESSION_CANCELLED' });
    });

    it('помечает занятие как созданное из шаблона', async () => {
      const view = await service.getSession('admin-1', 'session-1');

      expect(view.fromTemplate).toBe(true);
    });

    it('помечает занятие без шаблона как ручное', async () => {
      repository.findSession.mockResolvedValue({ ...session, scheduleTemplateId: null });

      const view = await service.getSession('admin-1', 'session-1');

      expect(view.fromTemplate).toBe(false);
    });

    it('ограничивает список занятий зоной видимости', async () => {
      scope.visibleGroupIds.mockResolvedValue(['group-1']);

      await service.listSessions('coach-1', {});

      expect(repository.listSessions).toHaveBeenCalledWith(
        expect.objectContaining({ visibleGroupIds: ['group-1'] }),
      );
    });
  });
});
