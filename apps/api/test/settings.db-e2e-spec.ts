import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/shared';
import { PrismaService } from '../src/prisma';
import { PasswordService } from '../src/modules/auth/password.service';
import { SettingsService } from '../src/modules/settings/settings.service';
import { DebtRulesService } from '../src/modules/settings/debt-rules.service';

/**
 * Настройки клуба: права, аудит и неизменяемость справочника (K7).
 *
 * Проверяется то, что нельзя подтвердить юнит-тестами: реальные guard'ы,
 * сериализация ответов, маскировка персональных данных в журнале и отсутствие
 * эндпоинтов изменения у справочника и аудита.
 *
 * Требует PostgreSQL с примененными миграциями (`pnpm test:e2e:db`).
 */
describe('Настройки: доступ, аудит, справочник (db e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let settings: SettingsService;
  let debtRules: DebtRulesService;

  let adminToken: string;
  let staffToken: string;
  let memberToken: string;

  const createdUserIds: string[] = [];
  // Версии правил удаляются по дате вступления: в ответе нет id, и это часть
  // контракта (версия — не сущность, которую можно адресовать).
  const createdRuleDates: Date[] = [];
  const stamp = Date.now();

  /** Пароль один на всех: лимит логинов не должен мешать тесту. */
  const password = 'E2E-Settings-2026!';

  async function createUser(role: 'SUPERADMIN' | 'STAFF' | 'MEMBER', suffix: string) {
    const hash = await new PasswordService().hash(password);
    const user = await prisma.db.user.create({
      data: {
        email: `settings-${suffix}-${stamp}@example.com`,
        firstName: 'E2E',
        lastName: suffix,
        role,
        status: 'ACTIVE',
        scopeAllGroups: role === 'SUPERADMIN',
        passwordHash: hash,
      },
      select: { id: true, email: true },
    });

    createdUserIds.push(user.id);
    return user;
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();

    prisma = moduleRef.get(PrismaService);
    settings = moduleRef.get(SettingsService);
    debtRules = moduleRef.get(DebtRulesService);

    const admin = await createUser('SUPERADMIN', 'admin');
    const staff = await createUser('STAFF', 'staff');
    const member = await createUser('MEMBER', 'member');

    adminToken = await login(admin.email);
    staffToken = await login(staff.email);
    memberToken = await login(member.email);
  }, 60_000);

  afterAll(async () => {
    // Тест меняет глобальные настройки: возвращаем их, чтобы соседние наборы не
    // зависели от порядка запуска.
    await settings.updateClubProfile(createdUserIds[0], {
      name: 'Карате-клуб OCTAGON',
      logoUrl: null,
      phone: null,
      email: null,
      address: null,
      timezone: 'Asia/Almaty',
    });

    if (createdRuleDates.length > 0) {
      await prisma.db.debtRule.deleteMany({ where: { effectiveFrom: { in: createdRuleDates } } });
    }

    await prisma.db.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await prisma.db.user.deleteMany({ where: { id: { in: createdUserIds } } });

    await app.close();
  });

  describe('доступ', () => {
    it('без токена отвечает 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/settings/club').expect(401);
      await request(app.getHttpServer()).get('/api/v1/audit').expect(401);
    });

    it('участник клуба не видит настройки', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/settings/club')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });

    it('сотрудник получает 403 на всех разделах настроек', async () => {
      // Индивидуальные grants не могут открыть эти разделы: проверка по роли.
      for (const path of [
        '/api/v1/settings/club',
        '/api/v1/settings/finance/debt-rules',
        '/api/v1/audit',
      ]) {
        await request(app.getHttpServer())
          .get(path)
          .set('Authorization', `Bearer ${staffToken}`)
          .expect(403);
      }
    });

    it('сотрудник не может изменить правило долга', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/settings/finance/debt-rules')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          effectiveFrom: '2030-01',
          useFullyPaidMark: true,
          noTrainingPolicy: 'EXEMPT',
          freezePolicy: 'EXEMPT_MONTH',
          expectedMissing: 'DEBTOR',
          partialTolerance: { kind: 'NONE' },
        })
        .expect(403);
    });
  });

  describe('профиль клуба', () => {
    it('суперадминистратор читает профиль без секретов', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/settings/club')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // В ответе только безопасные параметры: ни ключей, ни строк подключения.
      expect(Object.keys(response.body).sort()).toEqual(
        ['address', 'email', 'logoUrl', 'name', 'phone', 'timezone', 'updatedAt'].sort(),
      );
      expect(JSON.stringify(response.body)).not.toMatch(/secret|password|DATABASE_URL/i);
    });

    it('отклоняет смещение вместо IANA-имени', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/settings/club')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ timezone: '+05:00' })
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_FAILED');
    });

    it('сохраняет изменение и попадает в аудит с маскировкой', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/settings/club')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Карате-клуб OCTAGON E2E', phone: '+7 700 000 11 22', email: 'e2e@octagon.kz' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/api/v1/audit?action=settings.club_updated&limit=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const record = response.body.items[0];
      expect(record.entityType).toBe('ClubProfile');
      // Контакты замаскированы: поле видно, значение — нет.
      expect(record.after.phone).toBe('•••');
      expect(record.after.email).toBe('•••');
      expect(JSON.stringify(record)).not.toContain('+7 700 000 11 22');
    });
  });

  describe('справочник поясов', () => {
    it('читается любым аутентифицированным', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/belt-grades')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(response.body).toHaveLength(12);
      expect(response.body[0].code).toBe('WHITE');
      expect(response.body[11].code).toBe('BLACK');
    });

    it('не имеет эндпоинтов изменения', async () => {
      // Не «скрыты в интерфейсе», а не существуют: POST/DELETE дают 404.
      await request(app.getHttpServer())
        .post('/api/v1/belt-grades')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ label: 'Серый' })
        .expect(404);

      await request(app.getHttpServer())
        .delete('/api/v1/belt-grades/WHITE')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('журнал действий', () => {
    it('нельзя изменить или удалить запись', async () => {
      const list = await request(app.getHttpServer())
        .get('/api/v1/audit?limit=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const id = list.body.items[0].id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/audit/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'подмена' })
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/audit/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('правила долга', () => {
    it('действующая версия отдается с параметрами BR-004', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/settings/finance/debt-rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        useFullyPaidMark: true,
        noTrainingPolicy: 'EXEMPT',
        freezePolicy: 'EXEMPT_MONTH',
        expectedMissing: 'DEBTOR',
        partialTolerance: { kind: 'NONE' },
      });
    });

    it('не позволяет изменить прошлое', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/settings/finance/debt-rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          effectiveFrom: '2020-01',
          useFullyPaidMark: true,
          noTrainingPolicy: 'DEBTOR',
          freezePolicy: 'NONE',
          expectedMissing: 'NOT_DEBTOR',
          partialTolerance: { kind: 'FIXED', amount: 1000 },
        })
        .expect(400);

      expect(response.body.code).toBe('DEBT_RULES_EFFECTIVE_IN_PAST');
    });

    it('создает версию на будущий месяц и отклоняет дубликат', async () => {
      const now = new Date();
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const effectiveFrom = next.toISOString().slice(0, 7);

      // Остаток от прерванного прогона не должен ломать тест: версия на этот
      // месяц могла быть создана раньше.
      await prisma.db.debtRule.deleteMany({ where: { effectiveFrom: next } });

      await request(app.getHttpServer())
        .post('/api/v1/settings/finance/debt-rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          effectiveFrom,
          useFullyPaidMark: true,
          noTrainingPolicy: 'DEBTOR',
          freezePolicy: 'NONE',
          expectedMissing: 'NOT_DEBTOR',
          partialTolerance: { kind: 'PERCENT', percent: 3 },
        })
        .expect(201);

      createdRuleDates.push(next);

      const conflict = await request(app.getHttpServer())
        .post('/api/v1/settings/finance/debt-rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          effectiveFrom,
          useFullyPaidMark: true,
          noTrainingPolicy: 'EXEMPT',
          freezePolicy: 'EXEMPT_MONTH',
          expectedMissing: 'DEBTOR',
          partialTolerance: { kind: 'NONE' },
        })
        .expect(409);

      expect(conflict.body.code).toBe('DEBT_RULES_VERSION_CONFLICT');
    });

    it('проверяет допуск и месяц', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/settings/finance/debt-rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          effectiveFrom: '2031-01',
          useFullyPaidMark: true,
          noTrainingPolicy: 'EXEMPT',
          freezePolicy: 'EXEMPT_MONTH',
          expectedMissing: 'DEBTOR',
          partialTolerance: { kind: 'PERCENT', percent: 150 },
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/settings/finance/debt-rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          effectiveFrom: 'январь',
          useFullyPaidMark: true,
          noTrainingPolicy: 'EXEMPT',
          freezePolicy: 'EXEMPT_MONTH',
          expectedMissing: 'DEBTOR',
          partialTolerance: { kind: 'NONE' },
        })
        .expect(400);
    });

    it('история версий доступна суперадминистратору', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/settings/finance/debt-rules/versions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      expect(response.body.at(-1).isDefault).toBe(true);
    });

    it('предпросмотр считает изменения без сохранения', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/finance/debt-rules/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          config: {
            useFullyPaidMark: false,
            noTrainingPolicy: 'DEBTOR',
            freezePolicy: 'NONE',
            expectedMissing: 'NOT_DEBTOR',
            partialTolerance: { kind: 'FIXED', amount: 1000 },
          },
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          debtorsBefore: expect.any(Number),
          debtorsAfter: expect.any(Number),
          changed: expect.any(Array),
        }),
      );
    });
  });

  it('правила применяются к расчету: версия видна сервису', async () => {
    // Проверка связки: сервис правил и сервис настроек читают одну и ту же БД.
    const view = await debtRules.getForMonth(new Date().toISOString().slice(0, 7));

    expect(view.version).toBeGreaterThanOrEqual(1);
    expect(view.effectiveFrom).toMatch(/^\d{4}-\d{2}-01$/);
  });
});
