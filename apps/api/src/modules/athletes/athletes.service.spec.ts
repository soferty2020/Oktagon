import { AthleteStatus, BeltGrade, PermissionCode } from '@octagon/contracts';

import { AuditService } from '../audit/audit.service';
import { ResourceScopeService } from '../identity/resource-scope.service';
import type { PermissionResolver } from '../../shared/permissions.guard';
import type { AthleteRecord, AthletesRepository } from './athletes.repository';
import { AthletesService } from './athletes.service';

const athlete: AthleteRecord = {
  id: 'athlete-1',
  firstName: 'Али',
  lastName: 'Серик',
  middleName: null,
  birthDate: new Date('2015-09-01T00:00:00.000Z'),
  gender: 'MALE',
  status: 'ACTIVE',
  beltGrade: 'WHITE',
  rank: 'kyu-0',
  beltAwardedAt: null,
  phone: '+7 700 111 22 33',
  email: 'ali@example.com',
  notes: 'заметка клуба',
  hallId: null,
  createdAt: new Date('2026-03-01T10:00:00.000Z'),
  updatedAt: new Date('2026-03-01T10:00:00.000Z'),
};

describe('AthletesService', () => {
  let repository: jest.Mocked<AthletesRepository>;
  let scope: {
    visibleAthleteIds: jest.Mock;
    assertAthleteAccess: jest.Mock;
    checkAthlete: jest.Mock;
  };
  let audit: { recordSafely: jest.Mock };
  let permissions: { getPermissions: jest.Mock };
  let service: AthletesService;

  beforeEach(() => {
    repository = {
      list: jest.fn().mockResolvedValue([athlete]),
      find: jest.fn().mockResolvedValue(athlete),
      create: jest.fn().mockResolvedValue(athlete),
      update: jest.fn().mockResolvedValue(athlete),
      archive: jest.fn().mockResolvedValue(undefined),
    erase: jest.fn().mockResolvedValue(undefined),
      listAccounts: jest.fn().mockResolvedValue([]),
      findAffiliation: jest
        .fn()
        .mockResolvedValue({ group: null, trainer: null, branch: null }),
      findAccount: jest.fn().mockResolvedValue(null),
      linkAccount: jest.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'parent@example.com',
        relation: 'PARENT',
        isPrimary: false,
      }),
      clearPrimary: jest.fn().mockResolvedValue(undefined),
      unlinkAccount: jest.fn().mockResolvedValue(true),
      userExists: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<AthletesRepository>;

    scope = {
      visibleAthleteIds: jest.fn().mockResolvedValue(null),
      assertAthleteAccess: jest.fn().mockResolvedValue({ allowed: true, reason: 'role_superadmin' }),
      checkAthlete: jest.fn(),
    };

    audit = { recordSafely: jest.fn().mockResolvedValue(null) };
    permissions = {
      getPermissions: jest.fn().mockResolvedValue({
        codes: [PermissionCode.AthletesContactsView],
        grants: [],
      }),
    };

    service = new AthletesService(
      repository,
      scope as unknown as ResourceScopeService,
      audit as unknown as AuditService,
      permissions as unknown as PermissionResolver,
    );
  });

  describe('список', () => {
    it('суперадмин видит всех и контакты', async () => {
      const list = await service.list('admin-1');

      expect(list).toHaveLength(1);
      expect(list[0]?.phone).toBe('+7 700 111 22 33');
    });

    it('ограничивает выборку по scope тренера', async () => {
      scope.visibleAthleteIds.mockResolvedValue(['athlete-9']);

      const list = await service.list('coach-1');

      expect(list).toHaveLength(0);
    });

    it('пропускает спортсмена, если он в зоне видимости', async () => {
      scope.visibleAthleteIds.mockResolvedValue(['athlete-1']);

      const list = await service.list('coach-1');

      expect(list).toHaveLength(1);
    });

    it('скрывает контакты без права athletes.contacts.view', async () => {
      permissions.getPermissions.mockResolvedValue({
        codes: [PermissionCode.AthletesView],
        grants: [],
      });

      const list = await service.list('coach-1');

      expect(list[0]?.phone).toBeNull();
      expect(list[0]?.email).toBeNull();
    });

    it('передает фильтры в репозиторий', async () => {
      await service.list('admin-1', { status: 'ACTIVE', search: 'Али' });

      expect(repository.list).toHaveBeenCalledWith({ status: 'ACTIVE', search: 'Али' });
    });
  });

  describe('карточка', () => {
    it('проверяет scope и отдает заметки со связями', async () => {
      repository.listAccounts.mockResolvedValue([
        { userId: 'user-1', email: 'parent@example.com', relation: 'PARENT', isPrimary: true },
      ]);

      const details = await service.get('coach-1', 'athlete-1');

      expect(scope.assertAthleteAccess).toHaveBeenCalledWith('coach-1', 'athlete-1');
      expect(details.notes).toBe('заметка клуба');
      expect(details.linkedAccounts).toHaveLength(1);
      expect(details.birthDate).toBe('2015-09-01');
    });

    it('не отдает карточку вне scope', async () => {
      scope.assertAthleteAccess.mockRejectedValue(
        Object.assign(new Error('вне зоны'), { code: 'FORBIDDEN' }),
      );

      await expect(service.get('coach-1', 'athlete-9')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(repository.find).not.toHaveBeenCalled();
    });

    it('отдает 404 для неизвестного спортсмена', async () => {
      repository.find.mockResolvedValue(null);

      await expect(service.get('admin-1', 'missing')).rejects.toMatchObject({
        code: 'ATHLETE_NOT_FOUND',
      });
    });
  });

  describe('создание и изменение', () => {
    it('создает карточку и пишет аудит', async () => {
      await service.create({ firstName: 'Али', lastName: 'Серик' });

      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'athlete.created' }),
      );
    });

    it('преобразует дату из контракта в Date', async () => {
      await service.create({ firstName: 'Али', lastName: 'Серик', birthDate: '2015-09-01' });

      const [input] = repository.create.mock.calls[0] as [{ birthDate: Date | null }];
      expect(input.birthDate).toBeInstanceOf(Date);
      expect(input.birthDate?.toISOString().slice(0, 10)).toBe('2015-09-01');
    });

    it('передает пояс и дату присвоения в репозиторий', async () => {
      // K3: пояс — часть карточки, но меняется только с правом athletes.edit.
      await service.update('admin-1', 'athlete-1', {
        beltGrade: BeltGrade.YELLOW,
        beltAwardedAt: '2024-02-10',
      });

      const [id, input] = repository.update.mock.calls[0] as [
        string,
        { beltGrade: string; beltAwardedAt: Date },
      ];
      expect(id).toBe('athlete-1');
      expect(input.beltGrade).toBe(BeltGrade.YELLOW);
      expect(input.beltAwardedAt).toBeInstanceOf(Date);
      expect(input.beltAwardedAt.toISOString().slice(0, 10)).toBe('2024-02-10');
    });

    it('не сбрасывает пояс при обновлении других полей', async () => {
      // PATCH только со статусом не должен обнулять пояс: контроллер передает
      // beltGrade как есть, без `?? null`.
      await service.update('admin-1', 'athlete-1', { status: AthleteStatus.FROZEN });

      const [, input] = repository.update.mock.calls[0] as [string, { beltGrade?: unknown }];
      expect(input.beltGrade).toBeUndefined();
    });

    it('отдает пояс и дату в карточке', async () => {
      repository.find.mockResolvedValue({
        ...athlete,
        beltGrade: BeltGrade.GREEN_BROWN_STRIPE,
        beltAwardedAt: new Date('2023-05-01T00:00:00.000Z'),
      });

      const view = await service.get('admin-1', 'athlete-1');

      expect(view.beltGrade).toBe(BeltGrade.GREEN_BROWN_STRIPE);
      expect(view.beltAwardedAt).toBe('2023-05-01');
    });

    it('отдает белый пояс как значение по умолчанию', async () => {
      // Белый — ступень, с которой начинают, а не отсутствие данных: поле всегда
      // заполнено, и дата присвоения может быть неизвестна.
      const view = await service.get('admin-1', 'athlete-1');

      expect(view.beltGrade).toBe(BeltGrade.WHITE);
      expect(view.beltAwardedAt).toBeNull();
    });

    it('архивирует мягко', async () => {
      await service.archive('admin-1', 'athlete-1');

      expect(repository.archive).toHaveBeenCalledWith('athlete-1', expect.any(Date));      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'athlete.archived' }),
      );
    });
  });

  describe('связи аккаунтов', () => {
    it('связывает аккаунт и пишет аудит', async () => {
      await service.linkAccount('admin-1', 'athlete-1', { userId: 'user-1' });

      expect(repository.linkAccount).toHaveBeenCalledWith(
        expect.objectContaining({ athleteId: 'athlete-1', userId: 'user-1', relation: 'PARENT' }),
      );
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'athlete.account_linked' }),
      );
    });

    it('снимает признак основного аккаунта у остальных связей', async () => {
      await service.linkAccount('admin-1', 'athlete-1', { userId: 'user-1', isPrimary: true });

      expect(repository.clearPrimary).toHaveBeenCalledWith('athlete-1');
    });

    it('не снимает признак, если связь не основная', async () => {
      await service.linkAccount('admin-1', 'athlete-1', { userId: 'user-1' });

      expect(repository.clearPrimary).not.toHaveBeenCalled();
    });

    it('отклоняет неизвестный аккаунт', async () => {
      repository.userExists.mockResolvedValue(false);

      await expect(
        service.linkAccount('admin-1', 'athlete-1', { userId: 'ghost' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('отклоняет повторную связь того же аккаунта', async () => {
      repository.findAccount.mockResolvedValue({
        userId: 'user-1',
        email: 'parent@example.com',
        relation: 'PARENT',
        isPrimary: false,
      });

      await expect(
        service.linkAccount('admin-1', 'athlete-1', { userId: 'user-1' }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_ALREADY_LINKED' });
    });

    it('снимает связь и пишет аудит', async () => {
      await service.unlinkAccount('admin-1', 'athlete-1', 'user-1');

      expect(repository.unlinkAccount).toHaveBeenCalledWith('athlete-1', 'user-1');
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'athlete.account_unlinked' }),
      );
    });

    it('отдает 404, если связи не было', async () => {
      repository.unlinkAccount.mockResolvedValue(false);

      await expect(service.unlinkAccount('admin-1', 'athlete-1', 'user-1')).rejects.toMatchObject({
        code: 'ACCOUNT_NOT_LINKED',
      });
    });
  });
});
