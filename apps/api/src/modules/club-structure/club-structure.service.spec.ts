import { AuditService } from '../audit/audit.service';
import type { BranchRecord, ClubStructureRepository, HallRecord, TrainerRecord } from './club-structure.repository';
import { ClubStructureService } from './club-structure.service';

const branch: BranchRecord = {
  id: 'branch-1',
  name: 'Главный филиал',
  address: 'ул. Абая, 1',
  phone: '+7 700 000 00 00',
  isActive: true,
  createdAt: new Date('2026-03-01T10:00:00.000Z'),
  updatedAt: new Date('2026-03-01T10:00:00.000Z'),
};

const hall: HallRecord = {
  id: 'hall-1',
  branchId: 'branch-1',
  name: 'Основной зал',
  capacity: 40,
  isActive: true,
};

const trainer: TrainerRecord = {
  id: 'trainer-1',
  userId: null,
  displayName: 'Тренер Серик',
  phone: null,
  bio: null,
  isActive: true,
};

describe('ClubStructureService', () => {
  let repository: jest.Mocked<ClubStructureRepository>;
  let audit: { recordSafely: jest.Mock };
  let service: ClubStructureService;

  beforeEach(() => {
    repository = {
      listBranches: jest.fn().mockResolvedValue([branch]),
      findBranch: jest.fn().mockResolvedValue(branch),
      createBranch: jest.fn().mockResolvedValue(branch),
      updateBranch: jest.fn().mockResolvedValue(branch),
      archiveBranch: jest.fn().mockResolvedValue(undefined),
      listHalls: jest.fn().mockResolvedValue([hall]),
      findHall: jest.fn().mockResolvedValue(hall),
      createHall: jest.fn().mockResolvedValue(hall),
      updateHall: jest.fn().mockResolvedValue(hall),
      archiveHall: jest.fn().mockResolvedValue(undefined),
      listTrainers: jest.fn().mockResolvedValue([trainer]),
      findTrainer: jest.fn().mockResolvedValue(trainer),
      findTrainerByUserId: jest.fn().mockResolvedValue(null),
      createTrainer: jest.fn().mockResolvedValue(trainer),
      updateTrainer: jest.fn().mockResolvedValue(trainer),
      archiveTrainer: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ClubStructureRepository>;

    audit = { recordSafely: jest.fn().mockResolvedValue(null) };
    service = new ClubStructureService(repository, audit as unknown as AuditService);
  });

  describe('филиалы', () => {
    it('отдает список и карточку с залами', async () => {
      const list = await service.listBranches();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: 'branch-1', name: 'Главный филиал' });

      const details = await service.getBranch('branch-1');
      expect(details.halls).toHaveLength(1);
      expect(details.halls[0]?.name).toBe('Основной зал');
    });

    it('создает филиал и пишет аудит (BR-007)', async () => {
      await service.createBranch({ name: 'Главный филиал' });

      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'branch.created', entityId: 'branch-1' }),
      );
    });

    it('архивирует филиал мягко, передавая дату', async () => {
      await service.archiveBranch('branch-1');

      expect(repository.archiveBranch).toHaveBeenCalledWith('branch-1', expect.any(Date));
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'branch.archived' }),
      );
    });

    it('отдает 404 для неизвестного филиала', async () => {
      repository.findBranch.mockResolvedValue(null);

      await expect(service.getBranch('missing')).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' });
    });
  });

  describe('залы', () => {
    it('создает зал в активном филиале', async () => {
      await service.createHall({ branchId: 'branch-1', name: 'Основной зал' });

      expect(repository.createHall).toHaveBeenCalled();
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'hall.created' }),
      );
    });

    it('не дает создать зал в неактивном филиале', async () => {
      repository.findBranch.mockResolvedValue({ ...branch, isActive: false });

      await expect(
        service.createHall({ branchId: 'branch-1', name: 'Новый зал' }),
      ).rejects.toMatchObject({ code: 'BRANCH_ARCHIVED' });
      expect(repository.createHall).not.toHaveBeenCalled();
    });

    it('проверяет филиал перед выдачей залов', async () => {
      repository.findBranch.mockResolvedValue(null);

      await expect(service.listHalls('missing')).rejects.toMatchObject({
        code: 'BRANCH_NOT_FOUND',
      });
    });

    it('отдает 404 для неизвестного зала при изменении', async () => {
      repository.findHall.mockResolvedValue(null);

      await expect(service.updateHall('missing', { name: 'X' })).rejects.toMatchObject({
        code: 'HALL_NOT_FOUND',
      });
    });
  });

  describe('тренеры', () => {
    it('создает профиль без аккаунта', async () => {
      const created = await service.createTrainer({ displayName: 'Тренер Серик' });

      expect(created.userId).toBeNull();
      expect(repository.findTrainerByUserId).not.toHaveBeenCalled();
    });

    it('не дает привязать аккаунт, у которого уже есть профиль тренера', async () => {
      repository.findTrainerByUserId.mockResolvedValue(trainer);

      await expect(
        service.createTrainer({ displayName: 'Второй профиль', userId: 'user-1' }),
      ).rejects.toMatchObject({ code: 'TRAINER_ALREADY_ASSIGNED' });
      expect(repository.createTrainer).not.toHaveBeenCalled();
    });

    it('проверяет занятость аккаунта, если он указан', async () => {
      await service.createTrainer({ displayName: 'Тренер Серик', userId: 'user-1' });

      expect(repository.findTrainerByUserId).toHaveBeenCalledWith('user-1');
      expect(repository.createTrainer).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('отдает 404 для неизвестного тренера', async () => {
      repository.findTrainer.mockResolvedValue(null);

      await expect(service.getTrainer('missing')).rejects.toMatchObject({
        code: 'TRAINER_NOT_FOUND',
      });
    });

    it('архивирует профиль', async () => {
      await service.archiveTrainer('trainer-1');

      expect(repository.archiveTrainer).toHaveBeenCalledWith('trainer-1', expect.any(Date));
    });
  });
});
