import { Test } from '@nestjs/testing';
import { ApiErrorCode } from '@octagon/contracts';

import { AuditService } from '../audit/audit.service';
import { ClubStructureRepository } from './club-structure.repository';
import { ClubStructureService } from './club-structure.service';

describe('ClubStructureService (#64, #69)', () => {
  let service: ClubStructureService;

  const repository = {
    listHalls: jest.fn(),
    findHall: jest.fn(),
    createHall: jest.fn(),
    updateHall: jest.fn(),
    archiveHall: jest.fn(),
    listHallGroups: jest.fn().mockResolvedValue([]),
    countHallDependents: jest.fn().mockResolvedValue({ groups: 0, sessions: 0 }),
    listTrainers: jest.fn(),
    findTrainer: jest.fn(),
    findTrainerByUserId: jest.fn(),
    createTrainer: jest.fn(),
    updateTrainer: jest.fn(),
    archiveTrainer: jest.fn(),
    setTrainerAccount: jest.fn(),
    findAccount: jest.fn(),
  };

  const audit = { recordSafely: jest.fn().mockResolvedValue(undefined) };

  const hall = {
    id: 'hall-1',
    name: 'Центральный зал',
    address: 'ул. Абая, 1',
    phone: '+7 700 000 00 00',
    capacity: 40,
    isActive: true,
  };

  const trainer = {
    id: 'trainer-1',
    userId: null,
    displayName: 'Иванов Иван',
    firstName: 'Иван',
    lastName: 'Иванов',
    phone: null,
    bio: null,
    isActive: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    repository.countHallDependents.mockResolvedValue({ groups: 0, sessions: 0 });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ClubStructureService,
        { provide: ClubStructureRepository, useValue: repository },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get(ClubStructureService);
  });

  describe('залы', () => {
    it('создаёт зал с адресом и пишет аудит', async () => {
      repository.createHall.mockResolvedValue(hall);

      const result = await service.createHall({ name: hall.name, address: hall.address });

      expect(result.address).toBe('ул. Абая, 1');
      expect(audit.recordSafely).toHaveBeenCalled();
    });

    it('отдаёт зал с его группами', async () => {
      repository.findHall.mockResolvedValue(hall);
      repository.listHallGroups.mockResolvedValue([{ id: 'group-1', name: 'Старшая' }]);

      const result = await service.getHall('hall-1');

      expect(result.groups).toEqual([{ id: 'group-1', name: 'Старшая' }]);
    });

    it('не архивирует зал с группами', async () => {
      repository.findHall.mockResolvedValue(hall);
      repository.countHallDependents.mockResolvedValue({ groups: 2, sessions: 0 });

      await expect(service.archiveHall('hall-1')).rejects.toMatchObject({
        code: ApiErrorCode.HALL_IN_USE,
      });
      expect(repository.archiveHall).not.toHaveBeenCalled();
    });

    it('не архивирует зал с предстоящими занятиями', async () => {
      repository.findHall.mockResolvedValue(hall);
      repository.countHallDependents.mockResolvedValue({ groups: 0, sessions: 3 });

      await expect(service.archiveHall('hall-1')).rejects.toMatchObject({
        code: ApiErrorCode.HALL_IN_USE,
      });
    });

    it('архивирует пустой зал', async () => {
      repository.findHall.mockResolvedValue(hall);

      await service.archiveHall('hall-1');

      expect(repository.archiveHall).toHaveBeenCalledWith('hall-1', expect.any(Date));
    });

    it('неизвестный зал даёт 404', async () => {
      repository.findHall.mockResolvedValue(null);

      await expect(service.updateHall('missing', { name: 'X' })).rejects.toMatchObject({
        code: ApiErrorCode.HALL_NOT_FOUND,
      });
    });
  });

  describe('тренеры', () => {
    it('создаёт тренера с именем и фамилией', async () => {
      repository.createTrainer.mockResolvedValue(trainer);

      const result = await service.createTrainer({ firstName: 'Иван', lastName: 'Иванов' });

      expect(result.displayName).toBe('Иванов Иван');
    });

    it('не связывает аккаунт участника клуба', async () => {
      repository.findTrainer.mockResolvedValue(trainer);
      repository.findAccount.mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE' });

      await expect(service.linkTrainerAccount('trainer-1', 'user-1')).rejects.toMatchObject({
        code: ApiErrorCode.TRAINER_ACCOUNT_ROLE_INVALID,
      });
    });

    it('связывает аккаунт сотрудника', async () => {
      repository.findTrainer.mockResolvedValue(trainer);
      repository.findAccount.mockResolvedValue({ role: 'STAFF', status: 'ACTIVE' });
      repository.findTrainerByUserId.mockResolvedValue(null);
      repository.setTrainerAccount.mockResolvedValue({ ...trainer, userId: 'user-1' });

      const result = await service.linkTrainerAccount('trainer-1', 'user-1');

      expect(result.userId).toBe('user-1');
    });
  });
});
