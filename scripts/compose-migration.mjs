/**
 * Собирает migration.sql: сгенерированный Prisma SQL плюс блок ограничений,
 * которые Prisma schema не выражает.
 *
 * Причина отдельного шага: Prisma применяет только migration.sql, поэтому
 * extra_constraints.sql обязан быть включен в него — иначе частичные
 * уникальные индексы не создадутся при `prisma migrate deploy`.
 *
 * Запуск: node scripts/compose-migration.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(repoRoot, 'apps', 'api', 'prisma', 'migrations');

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/compose-migration.mjs <migration-folder-name>');
  process.exit(2);
}

const dir = join(migrationsDir, target);
const migrationPath = join(dir, 'migration.sql');
const extrasPath = join(dir, 'extra_constraints.sql');
const basePath = join(dir, 'migration.base.sql');

const migration = readFileSync(migrationPath, 'utf8');
const extras = readFileSync(extrasPath, 'utf8');

// Оригинальный сгенерированный SQL сохраняем один раз, чтобы повторный запуск
// не дописывал блок дважды.
let base;
try {
  base = readFileSync(basePath, 'utf8');
  console.log(`база берется из ${basePath}`);
} catch {
  base = migration;
  writeFileSync(basePath, base, 'utf8');
  console.log(`сохранена база: ${basePath}`);
}

const marker = 'CREATE UNIQUE INDEX "group_memberships_one_active_per_athlete"';
const composed = `${base.trimEnd()}\n\n${extras.trimEnd()}\n`;
writeFileSync(migrationPath, composed, 'utf8');

const occurrences = composed.split(marker).length - 1;
console.log(`migration.sql: ${composed.length} символов, вхождений маркера: ${occurrences}`);
if (occurrences !== 1) {
  console.error('Ожидалось ровно одно вхождение блока ограничений');
  process.exit(1);
}
