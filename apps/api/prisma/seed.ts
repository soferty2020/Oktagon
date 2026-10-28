/**
 * Seed: справочные данные и первый суперадминистратор.
 *
 * Идемпотентен: повторный запуск не создает дубликатов.
 * Запуск: pnpm --filter @octagon/api db:seed
 */
import { PrismaClient, type UserRole } from '../generated/prisma';
import { createHash } from 'node:crypto';

import { PasswordService } from '../src/modules/auth/password.service';

const prisma = new PrismaClient();

/** Каталог permissions из docs/04-roles-permissions.md. */
const PERMISSIONS: Array<{ code: string; description: string; isFinancial: boolean }> = [
  { code: 'athletes.view', description: 'Просмотр карточек спортсменов', isFinancial: false },
  { code: 'athletes.edit', description: 'Редактирование карточек спортсменов', isFinancial: false },
  {
    code: 'athletes.contacts.view',
    description: 'Просмотр контактов спортсменов и родителей',
    isFinancial: false,
  },
  { code: 'groups.view', description: 'Просмотр групп', isFinancial: false },
  { code: 'groups.edit', description: 'Редактирование групп', isFinancial: false },
  { code: 'attendance.view', description: 'Просмотр посещаемости', isFinancial: false },
  { code: 'attendance.edit', description: 'Отметка посещаемости', isFinancial: false },
  { code: 'schedule.view', description: 'Просмотр расписания', isFinancial: false },
  { code: 'schedule.edit', description: 'Редактирование расписания', isFinancial: false },
  { code: 'schedule.cancel', description: 'Отмена занятия', isFinancial: false },
  { code: 'schedule.change_trainer', description: 'Смена тренера занятия', isFinancial: false },
  { code: 'schedule.change_location', description: 'Смена зала/филиала занятия', isFinancial: false },
  { code: 'payments.view', description: 'Просмотр оплат', isFinancial: true },
  { code: 'payments.edit', description: 'Внесение и правка оплат', isFinancial: true },
  { code: 'freezes.view', description: 'Просмотр заморозок', isFinancial: true },
  { code: 'freezes.edit', description: 'Создание и завершение заморозок', isFinancial: true },
  { code: 'news.create', description: 'Создание новостей', isFinancial: false },
  { code: 'news.edit', description: 'Редактирование новостей', isFinancial: false },
  { code: 'news.delete', description: 'Удаление новостей', isFinancial: false },
  { code: 'news.moderate', description: 'Модерация комментариев', isFinancial: false },
  { code: 'chat.use', description: 'Использование чатов', isFinancial: false },
  { code: 'branches.view', description: 'Просмотр филиалов', isFinancial: false },
  { code: 'branches.manage', description: 'Управление филиалами и залами', isFinancial: false },
  { code: 'users.manage', description: 'Управление пользователями и приглашениями', isFinancial: false },
  { code: 'permissions.manage', description: 'Выдача индивидуальных permissions', isFinancial: false },
  { code: 'analytics.view', description: 'Доступ к dashboard и аналитике', isFinancial: false },
];

/**
 * Хеш пароля: Argon2id в PHC-формате (ADR-0004) — тот же алгоритм, что и в
 * модуле auth, иначе созданный seed-ом суперадмин не смог бы войти.
 */
export function hashPassword(password: string): Promise<string> {
  return new PasswordService().hash(password);
}

/** Отпечаток для сверки, что пароль не попал в БД в открытом виде. */
export function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

/**
 * Пароли-плейсхолдеры из примеров окружения (#47).
 *
 * Если такой пароль доехал до staging/production, администратор фактически
 * опубликован в репозитории: seed обязан отказаться.
 */
const PLACEHOLDER_SECRETS = [
  'changeme-octagon-2026!',
  'замените_на_сгенерированный',
  'change-me',
  'changeme',
  'placeholder',
  'replace-me',
];

export function isPlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_SECRETS.some(
    (placeholder) => normalized === placeholder || normalized.includes('замените_'),
  );
}

async function seedPermissions(): Promise<number> {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: { description: permission.description, isFinancial: permission.isFinancial },
      create: permission,
    });
  }
  return PERMISSIONS.length;
}

async function seedSuperadmin(): Promise<string | undefined> {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!email || !password) {
    console.warn(
      'SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD не заданы — суперадмин не создан (справочные данные заполнены).',
    );
    return undefined;
  }
  if (password.length < 12) {
    throw new Error('SUPERADMIN_PASSWORD должен быть не короче 12 символов');
  }

  // Пароль из репозитория — самый вероятный сценарий выката «по инструкции».
  // В staging/production такой пароль не принимаем вовсе (#47).
  const environment = process.env.NODE_ENV ?? 'local';
  if (environment !== 'local' && environment !== 'test' && isPlaceholderSecret(password)) {
    throw new Error(
      'SUPERADMIN_PASSWORD совпадает с плейсхолдером из репозитория: задайте настоящий пароль',
    );
  }

  const [firstName, ...rest] = (process.env.SUPERADMIN_NAME ?? 'Super Admin').split(' ');
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'SUPERADMIN' as UserRole, status: 'ACTIVE' },
    create: {
      email,
      passwordHash,
      firstName: firstName || 'Super',
      lastName: rest.join(' ') || 'Admin',
      role: 'SUPERADMIN' as UserRole,
      status: 'ACTIVE',
      scopeAllGroups: true,
    },
    select: { id: true, email: true },
  });

  // Отпечаток пароля в лог не печатаем: это подсказка для подбора (#47).
  console.log(`Суперадмин готов: ${user.email} (пароль ${password.length} симв.)`);
  return user.id;
}

async function seedClubStructure(): Promise<void> {
  const existing = await prisma.hall.count();
  if (existing > 0) {
    console.log(`Залы уже есть (${existing}) — структура клуба не изменяется.`);
    return;
  }

  const hall = await prisma.hall.create({
    data: {
      name: 'Основной зал',
      address: 'укажите адрес',
    },
  });

  console.log(`Создан зал "${hall.name}" — заполните адрес и группы.`);
}

async function main(): Promise<void> {
  const permissionCount = await seedPermissions();
  console.log(`Permissions: ${permissionCount}`);
  await seedSuperadmin();
  await seedClubStructure();
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
