/**
 * Генератор скелетов backend-модулей.
 *
 * Источник списка модулей: docs/13-architecture.md.
 * Каждый модуль получает <name>.module.ts, <name>.service.ts и index.ts.
 *
 * Запуск: node scripts/generate-modules.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const modulesRoot = join(repoRoot, 'apps', 'api', 'src', 'modules');

/** @type {Array<{dir: string, className: string, spec: string}>} */
const modules = [
  {
    dir: 'auth',
    className: 'Auth',
    spec: 'docs/01-mvp-scope.md (email/password), docs/09-api.md (access + refresh token), docs/15-security.md (rate limiting, rotation)',
  },
  {
    dir: 'identity',
    className: 'Identity',
    spec: 'docs/04-roles-permissions.md, docs/21-permission-matrix.md, docs/22-erd.md (User, Permission, UserPermission, UserInvite)',
  },
  {
    dir: 'athletes',
    className: 'Athletes',
    spec: 'docs/07-domain-model.md, docs/22-erd.md (Athlete, UserAthlete), docs/00-project-overview.md (аккаунт != карточка спортсмена)',
  },
  {
    dir: 'club-structure',
    className: 'ClubStructure',
    spec: 'docs/00-project-overview.md (3 филиала, рост до 5+), docs/22-erd.md (Branch, Hall, TrainerProfile)',
  },
  {
    dir: 'groups',
    className: 'Groups',
    spec: 'docs/22-erd.md (Group, GroupTrainer, GroupMembership), docs/08-database.md (одна активная GroupMembership на спортсмена)',
  },
  {
    dir: 'scheduling',
    className: 'Scheduling',
    spec: 'docs/01-mvp-scope.md (квартальное расписание, точечные переносы), BR-009, docs/22-erd.md (ScheduleTemplate, TrainingSession)',
  },
  {
    dir: 'attendance',
    className: 'Attendance',
    spec: 'BR-008, docs/16-testing.md (attendance edit), docs/22-erd.md (Attendance, PlannedAbsence)',
  },
  {
    dir: 'finance',
    className: 'Finance',
    spec: 'BR-001..BR-004, BR-010, docs/22-erd.md (MembershipPeriod, PaymentTransaction)',
  },
  {
    dir: 'freezes',
    className: 'Freezes',
    spec: 'BR-005, docs/08-database.md (один открытый период на спортсмена), docs/22-erd.md (FreezePeriod)',
  },
  {
    dir: 'news',
    className: 'News',
    spec: 'BR-011, docs/22-erd.md (NewsPost, NewsComment)',
  },
  {
    dir: 'chat',
    className: 'Chat',
    spec: 'BR-012, docs/01-mvp-scope.md (групповые и личные текстовые чаты), docs/22-erd.md (Conversation, Message)',
  },
  {
    dir: 'analytics',
    className: 'Analytics',
    spec: 'docs/17-acceptance-criteria.md (dashboard по филиалам), docs/01-mvp-scope.md (dashboard руководителя)',
  },
  {
    dir: 'audit',
    className: 'Audit',
    spec: 'BR-007, docs/08-database.md (AuditLog), docs/15-security.md',
  },
];

const moduleTemplate = ({ dir, className, spec }) => `import { Module } from '@nestjs/common';

import { ${className}Service } from './${dir}.service';

/**
 * Модуль ${dir}.
 *
 * Спецификация: ${spec}.
 * Публичный контракт и бизнес-логика добавляются отдельным issue
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Module({
  providers: [${className}Service],
  exports: [${className}Service],
})
export class ${className}Module {}
`;

const serviceTemplate = ({ dir, className, spec }) => `import { Injectable } from '@nestjs/common';

/**
 * Заготовка модуля ${dir}.
 *
 * Спецификация: ${spec}.
 * Публичный контракт модуля согласуется до реализации
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Injectable()
export class ${className}Service {}
`;

for (const definition of modules) {
  const targetDir = join(modulesRoot, definition.dir);
  await mkdir(targetDir, { recursive: true });
  await writeFile(join(targetDir, `${definition.dir}.module.ts`), moduleTemplate(definition), 'utf8');
  await writeFile(
    join(targetDir, `${definition.dir}.service.ts`),
    serviceTemplate(definition),
    'utf8',
  );
  await writeFile(
    join(targetDir, 'index.ts'),
    `export * from './${definition.dir}.module';\nexport * from './${definition.dir}.service';\n`,
    'utf8',
  );
  console.log(`ok ${definition.dir}`);
}

console.log(`\nВсего модулей: ${modules.length} -> ${modulesRoot}`);
