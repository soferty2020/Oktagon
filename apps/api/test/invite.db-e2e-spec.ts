import { UserStatus } from '../generated/prisma';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { AuditService } from '../src/modules/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthRepository, PrismaAuthRepository } from '../src/modules/auth/auth.repository';
import { InviteRepository, PrismaInviteRepository } from '../src/modules/auth/invite.repository';
import { InviteService } from '../src/modules/auth/invite.service';
import { PasswordService } from '../src/modules/auth/password.service';

/**
 * РџРѕР»РЅС‹Р№ С†РёРєР» РїСЂРёРіР»Р°С€РµРЅРёСЏ РЅР° СЂРµР°Р»СЊРЅРѕР№ Р‘Р” (B3):
 * РІС‹РґР°С‡Р° С‚РѕРєРµРЅР° -> РїСЂРёРЅСЏС‚РёРµ -> Р°РєС‚РёРІР°С†РёСЏ -> Р·Р°РїСЂРµС‚ РїРѕРІС‚РѕСЂРЅРѕРіРѕ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЏ.
 *
 * РљР°Р¶РґС‹Р№ С‚РµСЃС‚ СЂР°Р±РѕС‚Р°РµС‚ СЃРѕ СЃРІРѕРёРј email: С‚РµСЃС‚С‹ Р°РєС‚РёРІРёСЂСѓСЋС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№, Рё РѕР±С‰РёР№
 * Р°РґСЂРµСЃ Р»РѕРјР°Р» Р±С‹ РїРѕСЃР»РµРґСѓСЋС‰РёРµ СЃС†РµРЅР°СЂРёРё.
 *
 * РўСЂРµР±СѓРµС‚ РїСЂРёРјРµРЅРµРЅРЅРѕР№ РјРёРіСЂР°С†РёРё РІ octagon_test (СЃРј. docs/27-local-development.md).
 */
describe('InviteService (db e2e, С‚СЂРµР±СѓРµС‚СЃСЏ PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: InviteService;
  let adminId: string;
  let adminEmail: string;
  const createdEmails: string[] = [];

  const config = {
    get: (key: string) => (key === 'INVITE_TTL_HOURS' ? 72 : undefined),
  } as unknown as ConfigService<never, true>;

  /** РЈРЅРёРєР°Р»СЊРЅС‹Р№ email РґР»СЏ РѕРґРЅРѕРіРѕ С‚РµСЃС‚Р°. */
  const nextEmail = (prefix: string): string => {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@example.com`;
    createdEmails.push(email);
    return email;
  };

  const acceptInput = (email: string, password = 'Correct-Horse-Battery') => ({
    email,
    password,
    firstName: 'РђР»РёСЏ',
    lastName: 'РќСѓСЂР»Р°РЅ',
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        PrismaAuthRepository,
        { provide: AuthRepository, useExisting: PrismaAuthRepository },
        PrismaInviteRepository,
        { provide: InviteRepository, useExisting: PrismaInviteRepository },
        PasswordService,
        { provide: ConfigService, useValue: config },
        { provide: AuditService, useValue: { recordSafely: async () => null } },
        InviteService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(InviteService);

    // createdBy вЂ” UUID-СЃСЃС‹Р»РєР° РЅР° Р°РІС‚РѕСЂР° РїСЂРёРіР»Р°С€РµРЅРёСЏ, РїРѕСЌС‚РѕРјСѓ РЅСѓР¶РµРЅ СЂРµР°Р»СЊРЅС‹Р№
    // РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ-Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ.
    adminEmail = nextEmail('invite-admin');
    const admin = await prisma.db.user.create({
      data: {
        email: adminEmail,
        firstName: 'Admin',
        lastName: 'E2E',
        role: 'SUPERADMIN',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await prisma.db.userInvite.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.db.user.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.onModuleDestroy();
  });

  it('С…СЂР°РЅРёС‚ С…РµС€ С‚РѕРєРµРЅР°, Р° РЅРµ СЃР°Рј С‚РѕРєРµРЅ', async () => {
    const email = nextEmail('invite-hash');
    const created = await service.create({ email, role: 'STAFF', createdBy: adminId });

    const stored = await prisma.db.userInvite.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.tokenHash).toHaveLength(64);
    expect(stored.tokenHash).not.toBe(created.token);
    expect(stored.usedAt).toBeNull();
  });

  it('Р°РєС‚РёРІРёСЂСѓРµС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ Рё РіР°СЃРёС‚ РїСЂРёРіР»Р°С€РµРЅРёРµ', async () => {
    const email = nextEmail('invite-accept');
    const created = await service.create({ email, role: 'STAFF', createdBy: adminId });

    const accepted = await service.accept({ token: created.token, ...acceptInput(email) });

    expect(accepted.role).toBe('STAFF');

    const user = await prisma.db.user.findUniqueOrThrow({ where: { email } });
    expect(user.status).toBe(UserStatus.ACTIVE);
    expect(user.role).toBe('STAFF');
    expect(user.passwordHash?.startsWith('$argon2id$')).toBe(true);

    const stored = await prisma.db.userInvite.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.usedAt).not.toBeNull();
    expect(stored.usedBy).toBe(user.id);
  });

  it('Р·Р°РїСЂРµС‰Р°РµС‚ РїРѕРІС‚РѕСЂРЅРѕРµ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ С‚РѕРєРµРЅР°', async () => {
    const email = nextEmail('invite-reuse');
    const created = await service.create({ email, role: 'MEMBER', createdBy: adminId });

    await service.accept({ token: created.token, ...acceptInput(email) });

    await expect(
      service.accept({ token: created.token, ...acceptInput(email, 'Another-Password-1') }),
    ).rejects.toMatchObject({ code: 'INVITE_ALREADY_USED' });
  });

  it('РѕС‚РєР°Р·С‹РІР°РµС‚, РµСЃР»Рё email РЅРµ СЃРѕРІРїР°РґР°РµС‚ СЃ РїСЂРёРіР»Р°С€РµРЅРёРµРј', async () => {
    const invited = nextEmail('invite-foreign');
    const stranger = nextEmail('invite-stranger');
    const created = await service.create({ email: invited, role: 'MEMBER', createdBy: adminId });

    await expect(
      service.accept({ token: created.token, ...acceptInput(stranger) }),
    ).rejects.toMatchObject({ code: 'INVITE_EMAIL_MISMATCH' });
  });

  it('РѕС‚РєР°Р·С‹РІР°РµС‚ РїРѕ РёСЃС‚РµРєС€РµРјСѓ РїСЂРёРіР»Р°С€РµРЅРёСЋ', async () => {
    const email = nextEmail('invite-expired');
    const created = await service.create({ email, role: 'MEMBER', createdBy: adminId });
    await prisma.db.userInvite.update({
      where: { id: created.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      service.accept({ token: created.token, ...acceptInput(email) }),
    ).rejects.toMatchObject({ code: 'INVITE_EXPIRED' });
  });

  it('РїРµСЂРµРІС‹РїСѓСЃРє РіР°СЃРёС‚ РїСЂРµРґС‹РґСѓС‰РµРµ РїСЂРёРіР»Р°С€РµРЅРёРµ', async () => {
    const email = nextEmail('invite-resend');
    const first = await service.create({ email, role: 'STAFF', createdBy: adminId });
    const second = await service.create({ email, role: 'STAFF', createdBy: adminId });

    const firstStored = await prisma.db.userInvite.findUniqueOrThrow({ where: { id: first.id } });
    expect(firstStored.usedAt).not.toBeNull();

    const pending = await service.listPending(email);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(second.id);
  });

  it('РѕС‚РєР°Р·С‹РІР°РµС‚ РїРѕРІС‚РѕСЂРЅРѕ РїСЂРёРіР»Р°СЃРёС‚СЊ Р°РєС‚РёРІРЅРѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ', async () => {
    const email = nextEmail('invite-active');
    const created = await service.create({ email, role: 'STAFF', createdBy: adminId });
    await service.accept({ token: created.token, ...acceptInput(email) });

    await expect(
      service.create({ email, role: 'STAFF', createdBy: adminId }),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS' });
  });
});
