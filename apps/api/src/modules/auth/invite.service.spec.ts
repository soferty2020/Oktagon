import { ConfigService } from '@nestjs/config';

import { AuditService } from '../audit/audit.service';
import { AuthRepository, type AuthUserRecord } from './auth.repository';
import { InviteRepository, type InviteRecord } from './invite.repository';
import { InviteService } from './invite.service';
import { PasswordService } from './password.service';

const inviteRecord: InviteRecord = {
  id: 'invite-1',
  email: 'trainer@example.com',
  role: 'STAFF',
  tokenHash: 'stored-hash',
  expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
  usedAt: null,
  usedBy: null,
  createdAt: new Date('2026-03-01T10:00:00.000Z'),
  createdBy: 'admin-1',
};

const activatedUser: AuthUserRecord = {
  id: 'user-9',
  email: 'trainer@example.com',
  passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$salt$hash',
  role: 'STAFF',
  status: 'ACTIVE',
};

describe('InviteService', () => {
  let invites: jest.Mocked<InviteRepository>;
  let users: jest.Mocked<AuthRepository>;
  let passwords: { hash: jest.Mock };
  let audit: { recordSafely: jest.Mock };
  let service: InviteService;

  const config = {
    get: (key: string) => (key === 'INVITE_TTL_HOURS' ? 72 : undefined),
  } as unknown as ConfigService<never, true>;

  beforeEach(() => {
    invites = {
      create: jest.fn().mockResolvedValue(inviteRecord),
      findByTokenHash: jest.fn().mockResolvedValue(inviteRecord),
      findById: jest.fn().mockResolvedValue(inviteRecord),
      revokePendingForEmail: jest.fn().mockResolvedValue(0),
      consume: jest.fn().mockResolvedValue(true),
      attachConsumer: jest.fn().mockResolvedValue(undefined),
      listPending: jest.fn().mockResolvedValue([inviteRecord]),
    } as unknown as jest.Mocked<InviteRepository>;

    users = {
      findUserForAuth: jest.fn().mockResolvedValue(null),
      findUserById: jest.fn(),
      markLogin: jest.fn(),
      activateFromInvite: jest.fn().mockResolvedValue(activatedUser),
    } as unknown as jest.Mocked<AuthRepository>;

    passwords = { hash: jest.fn().mockResolvedValue('$argon2id$hash') };
    audit = { recordSafely: jest.fn().mockResolvedValue(null) };

    service = new InviteService(
      invites,
      users,
      passwords as unknown as PasswordService,
      audit as unknown as AuditService,
      config,
    );
  });

  describe('create', () => {
    it('создает приглашение и возвращает токен один раз', async () => {
      const created = await service.create({
        email: ' Trainer@Example.com ',
        role: 'STAFF',
        createdBy: 'admin-1',
      });

      expect(created.token).toMatch(/^[0-9a-f]{64}$/);
      expect(created.id).toBe('invite-1');
      // в БД уходит хеш, а не сам токен
      const [{ tokenHash }] = invites.create.mock.calls[0] as [{ tokenHash: string }];
      expect(tokenHash).toHaveLength(64);
      expect(tokenHash).not.toBe(created.token);
      // email нормализуется
      expect(invites.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'trainer@example.com' }),
      );
    });

    it('пишет аудит выдачи приглашения (BR-007)', async () => {
      await service.create({ email: 'trainer@example.com', role: 'STAFF', createdBy: 'admin-1' });

      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.invited', entityId: 'invite-1' }),
      );
    });

    it('отказывает, если пользователь уже активен', async () => {
      users.findUserForAuth.mockResolvedValue({ ...activatedUser });

      await expect(
        service.create({ email: 'trainer@example.com', role: 'STAFF', createdBy: 'admin-1' }),
      ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS' });
      expect(invites.create).not.toHaveBeenCalled();
    });

    it('разрешает перевыпуск для пользователя в статусе INVITED', async () => {
      users.findUserForAuth.mockResolvedValue({ ...activatedUser, status: 'INVITED' });
      invites.revokePendingForEmail.mockResolvedValue(1);

      await service.create({ email: 'trainer@example.com', role: 'STAFF', createdBy: 'admin-1' });

      expect(invites.revokePendingForEmail).toHaveBeenCalledWith('trainer@example.com');
      expect(invites.create).toHaveBeenCalled();
    });

    it('ставит срок действия из конфигурации (INVITE_TTL_HOURS)', async () => {
      const before = Date.now();
      await service.create({ email: 'trainer@example.com', role: 'STAFF', createdBy: 'admin-1' });

      const [{ expiresAt }] = invites.create.mock.calls[0] as [{ expiresAt: Date }];
      const expected = before + 72 * 3600 * 1000;
      expect(Math.abs(expiresAt.getTime() - expected)).toBeLessThan(5000);
    });
  });

  describe('accept', () => {
    const input = {
      token: 'a'.repeat(64),
      email: 'Trainer@Example.com',
      password: 'Correct-Horse-Battery',
      firstName: 'Алия',
      lastName: 'Нурлан',
    };

    it('активирует пользователя по токену и гасит приглашение', async () => {
      const result = await service.accept(input);

      expect(result).toEqual({ userId: 'user-9', email: 'trainer@example.com', role: 'STAFF' });
      expect(passwords.hash).toHaveBeenCalledWith('Correct-Horse-Battery');
      expect(invites.consume).toHaveBeenCalledWith('invite-1');
      expect(invites.attachConsumer).toHaveBeenCalledWith('invite-1', 'user-9');
      expect(audit.recordSafely).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.invite_accepted' }),
      );
    });

    it('ищет приглашение по хешу токена, а не по самому токену', async () => {
      await service.accept(input);

      const [hash] = invites.findByTokenHash.mock.calls[0] as [string];
      expect(hash).toHaveLength(64);
      expect(hash).not.toBe(input.token);
    });

    it('принимает приглашение по inviteId', async () => {
      await service.accept({ ...input, token: undefined, inviteId: 'invite-1' });

      expect(invites.findById).toHaveBeenCalledWith('invite-1');
    });

    it('требует токен или inviteId', async () => {
      await expect(
        service.accept({ ...input, token: undefined, inviteId: undefined }),
      ).rejects.toMatchObject({ code: 'INVITE_INVALID' });
    });

    it('отказывает, если приглашение не найдено', async () => {
      invites.findByTokenHash.mockResolvedValue(null);

      await expect(service.accept(input)).rejects.toMatchObject({ code: 'INVITE_INVALID' });
    });

    it('отказывает по истекшему приглашению', async () => {
      invites.findByTokenHash.mockResolvedValue({
        ...inviteRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.accept(input)).rejects.toMatchObject({ code: 'INVITE_EXPIRED' });
      expect(invites.consume).not.toHaveBeenCalled();
    });

    it('отказывает, если приглашение выдано на другой email', async () => {
      invites.findByTokenHash.mockResolvedValue({ ...inviteRecord, email: 'other@example.com' });

      await expect(service.accept(input)).rejects.toMatchObject({ code: 'INVITE_EMAIL_MISMATCH' });
    });

    it('отказывает при гонке: приглашение погашено другим запросом', async () => {
      invites.consume.mockResolvedValue(false);

      await expect(service.accept(input)).rejects.toMatchObject({ code: 'INVITE_ALREADY_USED' });
      expect(users.activateFromInvite).not.toHaveBeenCalled();
    });

    it('передает роль из приглашения, а не из запроса', async () => {
      invites.findByTokenHash.mockResolvedValue({ ...inviteRecord, role: 'STAFF' });

      await service.accept(input);

      expect(users.activateFromInvite).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'STAFF', email: 'trainer@example.com' }),
      );
    });
  });

  describe('listPending', () => {
    it('возвращает представление без хеша токена', async () => {
      const list = await service.listPending('trainer@example.com');

      expect(list).toEqual([
        {
          id: 'invite-1',
          email: 'trainer@example.com',
          role: 'STAFF',
          expiresAt: inviteRecord.expiresAt.toISOString(),
          createdAt: '2026-03-01T10:00:00.000Z',
        },
      ]);
      expect(list[0]).not.toHaveProperty('tokenHash');
    });
  });

  describe('preview', () => {
    it('отдает адрес, роль и срок по токену', async () => {
      const preview = await service.preview('token-from-link');

      expect(preview).toEqual({
        email: 'trainer@example.com',
        role: 'STAFF',
        expiresAt: inviteRecord.expiresAt.toISOString(),
      });
      // Хеш токена в ответ не попадает: страница принятия публичная.
      expect(preview).not.toHaveProperty('tokenHash');
    });

    it('ищет приглашение по хешу токена, а не по самому токену', async () => {
      await service.preview('token-from-link');

      // В БД хранится только хеш, поэтому искать по сырому токену нельзя.
      expect(invites.findByTokenHash).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/));
      expect(invites.findByTokenHash).not.toHaveBeenCalledWith('token-from-link');
    });

    it('не отличает неизвестный токен от истекшего и использованного', async () => {
      invites.findByTokenHash.mockResolvedValueOnce(null);
      await expect(service.preview('unknown')).rejects.toMatchObject({ code: 'INVITE_INVALID' });

      invites.findByTokenHash.mockResolvedValueOnce({
        ...inviteRecord,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.preview('expired')).rejects.toMatchObject({ code: 'INVITE_INVALID' });

      invites.findByTokenHash.mockResolvedValueOnce({ ...inviteRecord, usedAt: new Date() });
      await expect(service.preview('used')).rejects.toMatchObject({ code: 'INVITE_INVALID' });
    });
  });
});
