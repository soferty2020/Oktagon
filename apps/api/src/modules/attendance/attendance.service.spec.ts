import { AuditService } from '../audit/audit.service';
import type { GroupsRepository, RosterEntryRecord } from '../groups/groups.repository';
import { ResourceScopeService } from '../identity/resource-scope.service';
import type {
  AttendanceRepository,
  AttendanceRecord,
  PlannedAbsenceRecord,
  SessionRecord,
} from './attendance.repository';
import { AttendanceService } from './attendance.service';

const SESSION_START = new Date('2026-10-07T13:00:00.000Z');

const session: SessionRecord = {
  id: 'session-1',
  groupId: 'group-1',
  groupName: 'Дети 7-9 лет',
  startsAt: SESSION_START,
  endsAt: new Date('2026-10-07T14:30:00.000Z'),
  status: 'SCHEDULED',
};

const rosterEntry: RosterEntryRecord = {
  athleteId: 'athlete-1',
  firstName: 'Али',
  lastName: 'Серик',
  status: 'ACTIVE',
  joinedAt: new Date('2026-09-01T00:00:00.000Z'),
  leftAt: null,
};

const mark: AttendanceRecord = {
  athleteId: 'athlete-1',
  status: 'PRESENT',
  comment: null,
  markedAt: new Date('2026-10-07T14:00:00.000Z'),
  markedById: 'coach-1',
};

const absence: PlannedAbsenceRecord = {
  id: 'absence-1',
  athleteId: 'athlete-1',
  athleteName: 'Серик Али',
  reason: 'Поездка',
  reportedAt: new Date('2026-10-05T09:00:00.000Z'),
};

describe('AttendanceService', () => {
  let repository: jest.Mocked<AttendanceRepository>;
  let groups: { listRosterAsOf: jest.Mock };
  let scope: { assertGroupAccess: jest.Mock; assertAthleteAccess: jest.Mock };
  let audit: { recordSafely: jest.Mock };
  let service: AttendanceService;

  beforeEach(() => {
    repository = {
      findSession: jest.fn().mockResolvedValue(session),
      listSessionIds: jest.fn().mockResolvedValue(['session-1']),
      listAttendance: jest.fn().mockResolvedValue([]),
      listAttendanceForSessions: jest.fn().mockResolvedValue([]),
      listAthleteAttendance: jest.fn().mockResolvedValue([]),
      findAttendance: jest.fn().mockResolvedValue(null),
      upsertAttendance: jest.fn().mockResolvedValue(mark),
      deleteAttendance: jest.fn().mockResolvedValue(true),
      listPlannedAbsences: jest.fn().mockResolvedValue([]),
      findPlannedAbsence: jest.fn().mockResolvedValue(null),
      upsertPlannedAbsence: jest.fn().mockResolvedValue(absence),
      deletePlannedAbsence: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<AttendanceRepository>;

    groups = { listRosterAsOf: jest.fn().mockResolvedValue([rosterEntry]) };
    scope = {
      assertGroupAccess: jest.fn().mockResolvedValue({ allowed: true, reason: 'role_superadmin' }),
      assertAthleteAccess: jest.fn().mockResolvedValue({ allowed: true, reason: 'role_superadmin' }),
    };
    audit = { recordSafely: jest.fn().mockResolvedValue(null) };

    service = new AttendanceService(
      repository,
      groups as unknown as GroupsRepository,
      scope as unknown as ResourceScopeService,
      audit as unknown as AuditService,
    );
  });

  describe('журнал занятия', () => {
    it('строит список по составу группы на дату занятия', async () => {
      const view = await service.getSessionAttendance('coach-1', 'session-1');

      // Проверка состава идет именно на момент начала занятия: спортсмен,
      // зачисленный позже, не должен попадать в журнал задним числом.
      expect(groups.listRosterAsOf).toHaveBeenCalledWith('group-1', SESSION_START);
      expect(view.roster).toHaveLength(1);
      expect(view.roster[0]?.lastName).toBe('Серик');
      expect(view.markedCount).toBe(0);
    });

    it('показывает подтвержденную отметку и предупреждение родителя', async () => {
      repository.listAttendance.mockResolvedValue([mark]);
      repository.listPlannedAbsences.mockResolvedValue([absence]);

      const view = await service.getSessionAttendance('coach-1', 'session-1');

      expect(view.roster[0]?.attendance?.status).toBe('PRESENT');
      expect(view.roster[0]?.plannedAbsence?.reason).toBe('Поездка');
      expect(view.markedCount).toBe(1);
    });

    it('проверяет доступ к группе занятия', async () => {
      await service.getSessionAttendance('coach-1', 'session-1');

      expect(scope.assertGroupAccess).toHaveBeenCalledWith('coach-1', 'group-1');
    });

    it('отдает 404 для неизвестного занятия', async () => {
      repository.findSession.mockResolvedValue(null);

      await expect(service.getSessionAttendance('coach-1', 'ghost')).rejects.toMatchObject({
        code: 'TRAINING_SESSION_NOT_FOUND',
      });
    });
  });

  describe('отметка посещаемости', () => {
    it('записывает отметки и фиксирует их в аудите', async () => {
      const view = await service.saveAttendance('coach-1', 'session-1', {
        marks: [{ athleteId: 'athlete-1', status: 'PRESENT' }],
      });

      expect(repository.upsertAttendance).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          athleteId: 'athlete-1',
          status: 'PRESENT',
          markedById: 'coach-1',
        }),
      );
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'attendance.marked' }),
      );
      expect(view.sessionId).toBe('session-1');
    });

    it('помечает повторную отметку как изменение, а не как новую', async () => {
      repository.findAttendance.mockResolvedValue(mark);

      await service.saveAttendance('coach-1', 'session-1', {
        marks: [{ athleteId: 'athlete-1', status: 'ABSENT' }],
      });

      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'attendance.updated' }),
      );
    });

    it('не отмечает спортсмена, которого не было в группе на дату занятия', async () => {
      await expect(
        service.saveAttendance('coach-1', 'session-1', {
          marks: [{ athleteId: 'athlete-9', status: 'PRESENT' }],
        }),
      ).rejects.toMatchObject({ code: 'ATHLETE_NOT_IN_GROUP' });
      expect(repository.upsertAttendance).not.toHaveBeenCalled();
    });

    it('отклоняет пустой список без обращения к базе', async () => {
      await service.saveAttendance('coach-1', 'session-1', { marks: [] });

      expect(repository.upsertAttendance).not.toHaveBeenCalled();
    });

    it('снимает отметку', async () => {
      await service.resetAttendance('coach-1', 'session-1', 'athlete-1');

      expect(repository.deleteAttendance).toHaveBeenCalledWith('session-1', 'athlete-1');
    });

    it('отдает 404, если снимать нечего', async () => {
      repository.deleteAttendance.mockResolvedValue(false);

      await expect(
        service.resetAttendance('coach-1', 'session-1', 'athlete-1'),
      ).rejects.toMatchObject({ code: 'ATTENDANCE_NOT_FOUND' });
    });
  });

  describe('планируемое отсутствие (BR-008)', () => {
    it('сохраняет предупреждение и не создает отметку посещаемости', async () => {
      const view = await service.reportPlannedAbsence('parent-1', 'session-1', {
        athleteId: 'athlete-1',
        reason: 'Поездка',
      });

      expect(scope.assertAthleteAccess).toHaveBeenCalledWith('parent-1', 'athlete-1');
      expect(repository.upsertPlannedAbsence).toHaveBeenCalled();
      // Итог подтверждает тренер: предупреждение родителя отметку не создает.
      expect(repository.upsertAttendance).not.toHaveBeenCalled();
      expect(view.roster[0]?.attendance).toBeNull();
    });

    it('не принимает предупреждение о спортсмене вне группы', async () => {
      groups.listRosterAsOf.mockResolvedValue([]);

      await expect(
        service.reportPlannedAbsence('parent-1', 'session-1', { athleteId: 'athlete-9' }),
      ).rejects.toMatchObject({ code: 'ATHLETE_NOT_IN_GROUP' });
    });

    it('отклоняет предупреждение о чужом спортсмене', async () => {
      scope.assertAthleteAccess.mockRejectedValue(
        Object.assign(new Error('вне зоны'), { code: 'FORBIDDEN' }),
      );

      await expect(
        service.reportPlannedAbsence('parent-1', 'session-1', { athleteId: 'athlete-9' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(repository.upsertPlannedAbsence).not.toHaveBeenCalled();
    });

    it('отменяет предупреждение', async () => {
      await service.cancelPlannedAbsence('parent-1', 'session-1', 'athlete-1');

      expect(repository.deletePlannedAbsence).toHaveBeenCalledWith('session-1', 'athlete-1');
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'attendance.planned_absence_cancelled' }),
      );
    });

    it('отдает 404, если предупреждения не было', async () => {
      repository.deletePlannedAbsence.mockResolvedValue(false);

      await expect(
        service.cancelPlannedAbsence('parent-1', 'session-1', 'athlete-1'),
      ).rejects.toMatchObject({ code: 'PLANNED_ABSENCE_NOT_FOUND' });
    });
  });

  describe('сводка за период', () => {
    it('считает занятия по составу на каждую дату', async () => {
      repository.listSessionIds.mockResolvedValue(['session-1', 'session-2']);
      repository.findSession
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce({
          ...session,
          id: 'session-2',
          startsAt: new Date('2026-10-14T13:00:00.000Z'),
        });
      repository.listAttendanceForSessions.mockResolvedValue([
        { ...mark, sessionId: 'session-1' },
        { ...mark, sessionId: 'session-2', status: 'ABSENT' },
      ]);

      const summary = await service.summary(
        'coach-1',
        'group-1',
        new Date('2026-10-01T00:00:00.000Z'),
        new Date('2026-11-01T00:00:00.000Z'),
      );

      expect(summary).toHaveLength(1);
      expect(summary[0]).toMatchObject({
        athleteId: 'athlete-1',
        total: 2,
        present: 1,
        absent: 1,
        unmarked: 0,
      });
    });

    it('учитывает посещение только за то занятие, где стоит отметка', async () => {
      // Отметка есть только на первом занятии: второе должно попасть в
      // «без отметки», а не получить статус первого.
      repository.listSessionIds.mockResolvedValue(['session-1', 'session-2']);
      repository.findSession
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce({
          ...session,
          id: 'session-2',
          startsAt: new Date('2026-10-14T13:00:00.000Z'),
        });
      repository.listAttendanceForSessions.mockResolvedValue([
        { ...mark, sessionId: 'session-1' },
      ]);

      const summary = await service.summary(
        'coach-1',
        'group-1',
        new Date('2026-10-01T00:00:00.000Z'),
        new Date('2026-11-01T00:00:00.000Z'),
      );

      expect(summary[0]).toMatchObject({ total: 2, present: 1, unmarked: 1 });
    });

    it('возвращает пустую сводку, если занятий не было', async () => {
      repository.listSessionIds.mockResolvedValue([]);

      await expect(
        service.summary(
          'coach-1',
          'group-1',
          new Date('2026-10-01T00:00:00.000Z'),
          new Date('2026-11-01T00:00:00.000Z'),
        ),
      ).resolves.toEqual([]);
    });
  });

  describe('история посещений', () => {
    it('отдает отметки по занятиям от новых к старым', async () => {
      repository.listAthleteAttendance.mockResolvedValue([
        {
          sessionId: 'session-2',
          groupId: 'group-1',
          groupName: 'Дети 7-9',
          startsAt: new Date('2026-10-20T11:00:00.000Z'),
          status: 'ABSENT',
          comment: 'Болезнь',
          markedAt: new Date('2026-10-20T13:00:00.000Z'),
        },
        {
          sessionId: 'session-1',
          groupId: 'group-1',
          groupName: 'Дети 7-9',
          startsAt: new Date('2026-10-18T11:00:00.000Z'),
          status: 'PRESENT',
          comment: null,
          markedAt: new Date('2026-10-18T12:30:00.000Z'),
        },
      ]);

      const history = await service.history(
        'parent-1',
        'athlete-1',
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-11-01T00:00:00.000Z'),
      );

      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({ sessionId: 'session-2', status: 'ABSENT' });
      expect(history[1]).toMatchObject({ sessionId: 'session-1', status: 'PRESENT' });
      // Доступ проверяется до запроса: иначе чужой ребенок выдал бы 404 вместо 403.
      expect(scope.assertAthleteAccess).toHaveBeenCalledWith('parent-1', 'athlete-1');
    });

    it('не отдает историю чужого спортсмена', async () => {
      scope.assertAthleteAccess.mockRejectedValueOnce(new Error('forbidden'));

      await expect(
        service.history(
          'parent-1',
          'athlete-9',
          new Date('2026-10-01T00:00:00.000Z'),
          new Date('2026-11-01T00:00:00.000Z'),
        ),
      ).rejects.toThrow('forbidden');

      expect(repository.listAthleteAttendance).not.toHaveBeenCalled();
    });
  });
});
