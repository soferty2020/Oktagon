import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ApiErrorCode } from '@octagon/contracts';

import { AuditService } from '../audit/audit.service';
import { ResourceScopeService } from '../identity/resource-scope.service';
import { OnboardingRepository } from './onboarding.repository';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService (ADR-0015)', () => {
  let service: OnboardingService;

  const repository = {
    clearActiveCodes: jest.fn().mockResolvedValue(undefined),
    createCode: jest.fn(),
    findCode: jest.fn(),
    markCodeUsed: jest.fn().mockResolvedValue(undefined),
    isLinked: jest.fn().mockResolvedValue(false),
    linkAthlete: jest.fn().mockResolvedValue(undefined),
    createRequest: jest.fn(),
    findRequest: jest.fn(),
    hasPendingRequest: jest.fn().mockResolvedValue(false),
    listRequests: jest.fn().mockResolvedValue([]),
    listPending: jest.fn().mockResolvedValue([]),
    approveRequest: jest.fn(),
    rejectRequest: jest.fn(),
    findCandidates: jest.fn().mockResolvedValue([]),
  };

  const scope = { assertAthleteAccess: jest.fn().mockResolvedValue(undefined) };
  const audit = { recordSafely: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue(72) };

  beforeEach(async () => {
    jest.clearAllMocks();
    repository.isLinked.mockResolvedValue(false);
    repository.hasPendingRequest.mockResolvedValue(false);

    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: OnboardingRepository, useValue: repository },
        { provide: ResourceScopeService, useValue: scope },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(OnboardingService);
  });

  describe('выдача кода', () => {
    it('проверяет scope, гасит старые коды и возвращает код один раз', async () => {
      repository.createCode.mockResolvedValue({
        id: 'code-1',
        athleteId: 'athlete-1',
        codeHash: 'hash',
        expiresAt: new Date('2026-11-06T00:00:00Z'),
        usedAt: null,
      });

      const result = await service.issueCode('trainer-1', 'athlete-1');

      expect(scope.assertAthleteAccess).toHaveBeenCalledWith('trainer-1', 'athlete-1');
      expect(repository.clearActiveCodes).toHaveBeenCalledWith('athlete-1');
      expect(result.code).toHaveLength(8);
      expect(result.athleteId).toBe('athlete-1');
      // В базе хеш, не сам код.
      expect(repository.createCode).toHaveBeenCalledWith(
        expect.objectContaining({ codeHash: expect.not.stringMatching(/^[A-Z2-9]{8}$/) }),
      );
    });
  });

  describe('принятие кода', () => {
    it('привязывает родителя и гасит код', async () => {
      repository.findCode.mockResolvedValue({
        id: 'code-1',
        athleteId: 'athlete-1',
        codeHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      });

      await expect(service.acceptCode('parent-1', 'K7M2P4QX')).resolves.toEqual({
        athleteId: 'athlete-1',
      });
      expect(repository.linkAthlete).toHaveBeenCalledWith('parent-1', 'athlete-1');
      expect(repository.markCodeUsed).toHaveBeenCalledWith('code-1', 'parent-1');
    });

    it('неверный код неотличим от истёкшего', async () => {
      repository.findCode.mockResolvedValue(null);

      await expect(service.acceptCode('parent-1', 'WRONG123')).rejects.toMatchObject({
        code: ApiErrorCode.LINK_CODE_INVALID,
      });
    });

    it('истёкший код не принимается', async () => {
      repository.findCode.mockResolvedValue({
        id: 'code-1',
        athleteId: 'athlete-1',
        codeHash: 'hash',
        expiresAt: new Date(Date.now() - 1_000),
        usedAt: null,
      });

      await expect(service.acceptCode('parent-1', 'K7M2P4QX')).rejects.toMatchObject({
        code: ApiErrorCode.LINK_CODE_INVALID,
      });
    });

    it('повторная привязка к тому же ребёнку отклоняется', async () => {
      repository.findCode.mockResolvedValue({
        id: 'code-1',
        athleteId: 'athlete-1',
        codeHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      });
      repository.isLinked.mockResolvedValue(true);

      await expect(service.acceptCode('parent-1', 'K7M2P4QX')).rejects.toMatchObject({
        code: ApiErrorCode.LINK_CODE_ALREADY_LINKED,
      });
      expect(repository.linkAthlete).not.toHaveBeenCalled();
    });
  });

  describe('заявки', () => {
    it('создаёт заявку и пишет аудит', async () => {
      repository.createRequest.mockResolvedValue({
        id: 'req-1',
        userId: 'parent-1',
        firstName: 'Дмитрий',
        lastName: 'Сагабиев',
        birthDate: null,
        phone: null,
        status: 'PENDING',
        athleteId: null,
        rejectReason: null,
        createdAt: new Date('2026-11-03T10:00:00Z'),
      });

      const result = await service.createRequest('parent-1', {
        firstName: 'Дмитрий',
        lastName: 'Сагабиев',
      });

      expect(result.status).toBe('PENDING');
      expect(audit.recordSafely).toHaveBeenCalled();
    });

    it('повторная заявка на того же ребёнка отклоняется', async () => {
      repository.hasPendingRequest.mockResolvedValue(true);

      await expect(
        service.createRequest('parent-1', { firstName: 'Дмитрий', lastName: 'Сагабиев' }),
      ).rejects.toMatchObject({ code: ApiErrorCode.LINK_REQUEST_ALREADY_PENDING });
    });

    it('подтверждение связывает родителя и закрывает заявку', async () => {
      repository.findRequest.mockResolvedValue({
        id: 'req-1',
        userId: 'parent-1',
        firstName: 'Дмитрий',
        lastName: 'Сагабиев',
        birthDate: null,
        phone: null,
        status: 'PENDING',
        athleteId: null,
        rejectReason: null,
        createdAt: new Date(),
      });
      repository.approveRequest.mockResolvedValue({
        id: 'req-1',
        userId: 'parent-1',
        firstName: 'Дмитрий',
        lastName: 'Сагабиев',
        birthDate: null,
        phone: null,
        status: 'APPROVED',
        athleteId: 'athlete-1',
        rejectReason: null,
        createdAt: new Date(),
      });

      const result = await service.approve('admin-1', 'req-1', 'athlete-1');

      expect(scope.assertAthleteAccess).toHaveBeenCalledWith('admin-1', 'athlete-1');
      expect(repository.linkAthlete).toHaveBeenCalledWith('parent-1', 'athlete-1');
      expect(result.status).toBe('APPROVED');
    });

    it('рассмотренную заявку повторно не подтвердить', async () => {
      repository.findRequest.mockResolvedValue({
        id: 'req-1',
        userId: 'parent-1',
        firstName: 'Дмитрий',
        lastName: 'Сагабиев',
        birthDate: null,
        phone: null,
        status: 'APPROVED',
        athleteId: 'athlete-1',
        rejectReason: null,
        createdAt: new Date(),
      });

      await expect(service.approve('admin-1', 'req-1', 'athlete-1')).rejects.toMatchObject({
        code: ApiErrorCode.LINK_REQUEST_NOT_PENDING,
      });
    });

    it('отклонение сохраняет причину', async () => {
      repository.findRequest.mockResolvedValue({
        id: 'req-1',
        userId: 'parent-1',
        firstName: 'Дмитрий',
        lastName: 'Сагабиев',
        birthDate: null,
        phone: null,
        status: 'PENDING',
        athleteId: null,
        rejectReason: null,
        createdAt: new Date(),
      });
      repository.rejectRequest.mockResolvedValue({
        id: 'req-1',
        userId: 'parent-1',
        firstName: 'Дмитрий',
        lastName: 'Сагабиев',
        birthDate: null,
        phone: null,
        status: 'REJECTED',
        athleteId: null,
        rejectReason: 'Дата рождения не совпадает',
        createdAt: new Date(),
      });

      const result = await service.reject('admin-1', 'req-1', 'Дата рождения не совпадает');

      expect(result.rejectReason).toBe('Дата рождения не совпадает');
    });
  });
});
