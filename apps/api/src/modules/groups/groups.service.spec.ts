import { AuditService } from '../audit/audit.service';
import { ResourceScopeService } from '../identity/resource-scope.service';
import type { GroupsRepository, GroupRecord } from './groups.repository';
import { GroupsService } from './groups.service';

const group: GroupRecord = {
  id: 'group-1',
  name: 'Дети 7-9 лет',
  description: null,
  hallId: 'hall-1',
  hall: { name: 'Центральный зал' },
  isActive: true,
  createdAt: new Date('2026-03-01T10:00:00.000Z'),
  updatedAt: new Date('2026-03-01T10:00:00.000Z'),
};

describe('GroupsService', () => {
  let repository: jest.Mocked<GroupsRepository>;
  let scope: {
    visibleGroupIds: jest.Mock;
    assertGroupAccess: jest.Mock;
    assertAthleteAccess: jest.Mock;
    visibleAthleteIds: jest.Mock;
  };
  let audit: { recordSafely: jest.Mock };
  let service: GroupsService;

  beforeEach(() => {
    repository = {
      list: jest.fn().mockResolvedValue([group]),
      find: jest.fn().mockResolvedValue(group),
      create: jest.fn().mockResolvedValue(group),
      update: jest.fn().mockResolvedValue(group),
      archive: jest.fn().mockResolvedValue(undefined),
      countActiveMembers: jest.fn().mockResolvedValue(3),
      listTrainers: jest.fn().mockResolvedValue([
        {
          trainerId: 'trainer-1',
          displayName: 'Тренер Серик',
          isPrimary: true,
          assignedAt: new Date('2026-03-01T10:00:00.000Z'),
        },
      ]),
      findActiveTrainer: jest.fn().mockResolvedValue(null),
      assignTrainer: jest.fn().mockResolvedValue({
        trainerId: 'trainer-1',
        displayName: 'Тренер Серик',
        isPrimary: false,
        assignedAt: new Date('2026-03-01T10:00:00.000Z'),
      }),
      clearPrimaryTrainer: jest.fn().mockResolvedValue(undefined),
      unassignTrainer: jest.fn().mockResolvedValue(true),
      trainerExists: jest.fn().mockResolvedValue(true),
      listMembers: jest.fn().mockResolvedValue([
        {
          athleteId: 'athlete-1',
          firstName: 'Али',
          lastName: 'Серик',
          status: 'ACTIVE',
          joinedAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      ]),
      addMember: jest.fn().mockResolvedValue({
        athleteId: 'athlete-1',
        firstName: 'Али',
        lastName: 'Серик',
        status: 'ACTIVE',
        joinedAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
      findActiveMembership: jest.fn().mockResolvedValue(null),
      findMembershipInGroup: jest.fn().mockResolvedValue(false),
      endMembership: jest.fn().mockResolvedValue(true),
      athleteExists: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<GroupsRepository>;

    scope = {
      visibleGroupIds: jest.fn().mockResolvedValue(null),
      assertGroupAccess: jest.fn().mockResolvedValue({ allowed: true, reason: 'role_superadmin' }),
      assertAthleteAccess: jest.fn().mockResolvedValue({ allowed: true }),
      visibleAthleteIds: jest.fn().mockResolvedValue(null),
    };

    audit = { recordSafely: jest.fn().mockResolvedValue(null) };

    service = new GroupsService(
      repository,
      scope as unknown as ResourceScopeService,
      audit as unknown as AuditService,
    );
  });

  describe('группы', () => {
    it('передает scope в выборку и считает участников', async () => {
      scope.visibleGroupIds.mockResolvedValue(['group-1']);

      const list = await service.list('coach-1');

      expect(repository.list).toHaveBeenCalledWith(
        expect.objectContaining({ visibleGroupIds: ['group-1'] }),
      );
      expect(list[0]).toMatchObject({
        id: 'group-1',
        activeMembersCount: 3,
        hallName: 'Центральный зал',
      });
    });

    it('отдает детали с тренерами и составом', async () => {
      const details = await service.get('admin-1', 'group-1');

      expect(scope.assertGroupAccess).toHaveBeenCalledWith('admin-1', 'group-1');
      expect(details.hallName).toBe('Центральный зал');
      expect(details.trainers[0]?.displayName).toBe('Тренер Серик');
      expect(details.members[0]?.joinedAt).toBe('2026-09-01');
    });

    it('создает группу и пишет аудит', async () => {
      await service.create({ name: 'Дети 7-9 лет' });

      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'group.created' }),
      );
    });

    it('архивирует группу мягко', async () => {
      await service.archive('admin-1', 'group-1');

      expect(repository.archive).toHaveBeenCalledWith('group-1', expect.any(Date));
    });

    it('отдает 404 для неизвестной группы', async () => {
      repository.find.mockResolvedValue(null);

      await expect(service.get('admin-1', 'missing')).rejects.toMatchObject({
        code: 'GROUP_NOT_FOUND',
      });
    });
  });

  describe('тренеры группы', () => {
    it('назначает тренера и пишет аудит', async () => {
      await service.assignTrainer('admin-1', 'group-1', { trainerId: 'trainer-1' });

      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'group.trainer_assigned' }),
      );
    });

    it('отклоняет повторное назначение активного тренера', async () => {
      repository.findActiveTrainer.mockResolvedValue({
        trainerId: 'trainer-1',
        displayName: 'Тренер Серик',
        isPrimary: false,
        assignedAt: new Date(),
      });

      await expect(
        service.assignTrainer('admin-1', 'group-1', { trainerId: 'trainer-1' }),
      ).rejects.toMatchObject({ code: 'GROUP_TRAINER_ALREADY_ASSIGNED' });
      expect(repository.assignTrainer).not.toHaveBeenCalled();
    });

    it('отклоняет неизвестного тренера', async () => {
      repository.trainerExists.mockResolvedValue(false);

      await expect(
        service.assignTrainer('admin-1', 'group-1', { trainerId: 'ghost' }),
      ).rejects.toMatchObject({ code: 'TRAINER_NOT_FOUND' });
    });

    it('снимает признак основного тренера при назначении нового', async () => {
      await service.assignTrainer('admin-1', 'group-1', {
        trainerId: 'trainer-1',
        isPrimary: true,
      });

      expect(repository.clearPrimaryTrainer).toHaveBeenCalledWith('group-1');
    });

    it('отклоняет снятие неназначенного тренера', async () => {
      repository.unassignTrainer.mockResolvedValue(false);

      await expect(
        service.unassignTrainer('admin-1', 'group-1', 'trainer-9'),
      ).rejects.toMatchObject({ code: 'GROUP_TRAINER_NOT_ASSIGNED' });
    });
  });

  describe('состав группы', () => {
    it('добавляет спортсмена и пишет аудит', async () => {
      await service.addMember('admin-1', 'group-1', { athleteId: 'athlete-1' });

      expect(repository.addMember).toHaveBeenCalledWith(
        expect.objectContaining({ groupId: 'group-1', athleteId: 'athlete-1' }),
      );
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'group.membership_added' }),
      );
    });

    it('использует переданную дату вступления', async () => {
      await service.addMember('admin-1', 'group-1', {
        athleteId: 'athlete-1',
        joinedAt: '2026-09-01',
      });

      const [input] = repository.addMember.mock.calls[0] as [{ joinedAt: Date }];
      expect(input.joinedAt.toISOString().slice(0, 10)).toBe('2026-09-01');
    });

    it('отклоняет спортсмена с активной группой и указывает текущую', async () => {
      repository.findActiveMembership.mockResolvedValue({
        membershipId: 'membership-1',
        groupId: 'group-2',
        groupName: 'Другая группа',
        joinedAt: new Date(),
      });

      await expect(
        service.addMember('admin-1', 'group-1', { athleteId: 'athlete-1' }),
      ).rejects.toMatchObject({
        code: 'ACTIVE_MEMBERSHIP_EXISTS',
        details: { currentGroupId: 'group-2', currentGroupName: 'Другая группа' },
      });
      expect(repository.addMember).not.toHaveBeenCalled();
    });

    it('отклоняет повторное добавление в ту же группу', async () => {
      repository.findMembershipInGroup.mockResolvedValue(true);

      await expect(
        service.addMember('admin-1', 'group-1', { athleteId: 'athlete-1' }),
      ).rejects.toMatchObject({ code: 'ATHLETE_ALREADY_MEMBER' });
    });

    it('не добавляет в неактивную группу', async () => {
      repository.find.mockResolvedValue({ ...group, isActive: false });

      await expect(
        service.addMember('admin-1', 'group-1', { athleteId: 'athlete-1' }),
      ).rejects.toMatchObject({ code: 'GROUP_ARCHIVED' });
    });

    it('отклоняет неизвестного спортсмена', async () => {
      repository.athleteExists.mockResolvedValue(false);

      await expect(
        service.addMember('admin-1', 'group-1', { athleteId: 'ghost' }),
      ).rejects.toMatchObject({ code: 'ATHLETE_NOT_FOUND' });
    });

    it('завершает членство и пишет аудит', async () => {
      await service.endMembership('admin-1', 'group-1', 'athlete-1');

      expect(repository.endMembership).toHaveBeenCalledWith(
        'group-1',
        'athlete-1',
        expect.any(Date),
      );
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'group.membership_ended' }),
      );
    });

    it('отдает 404, если активного членства нет', async () => {
      repository.endMembership.mockResolvedValue(false);

      await expect(
        service.endMembership('admin-1', 'group-1', 'athlete-1'),
      ).rejects.toMatchObject({ code: 'MEMBERSHIP_NOT_FOUND' });
    });

    it('возвращает действующую группу спортсмена', async () => {
      repository.findActiveMembership.mockResolvedValue({
        membershipId: 'membership-1',
        groupId: 'group-1',
        groupName: 'Дети 7-9 лет',
        joinedAt: new Date('2026-09-01T00:00:00.000Z'),
      });

      await expect(service.getActiveMembership('admin-1', 'athlete-1')).resolves.toMatchObject({
        groupId: 'group-1',
        groupName: 'Дети 7-9 лет',
        joinedAt: '2026-09-01',
      });
    });

    it('возвращает null, если действующей группы нет', async () => {
      await expect(service.getActiveMembership('admin-1', 'athlete-1')).resolves.toBeNull();
    });
  });
});
