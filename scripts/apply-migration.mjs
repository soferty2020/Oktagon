/**
 * Применение миграции к локальной базе через psql.
 *
 * Используется там, где `prisma migrate deploy` недоступен (schema-engine
 * блокируется ограничениями среды, см. docs/27-local-development.md).
 *
 * Запуск: node scripts/apply-migration.mjs <migrationDir>
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const psql = join(repoRoot, '.tools', 'pgsql', 'bin', 'psql.exe');

const migrationDirArg = process.argv[2];
if (!migrationDirArg) {
  console.error('usage: node scripts/apply-migration.mjs <migrationDir>');
  process.exit(2);
}

const migrationDir = resolve(repoRoot, migrationDirArg);
const migrationSql = join(migrationDir, 'migration.sql');
const extraSql = join(migrationDir, 'extra_constraints.sql');

if (!existsSync(migrationSql)) {
  console.error(`Не найден ${migrationSql}`);
  process.exit(1);
}
if (!existsSync(psql)) {
  console.error(`Не найден psql: ${psql}. См. docs/27-local-development.md.`);
  process.exit(1);
}

const databaseUrl = process.env.MIGRATION_DATABASE_URL ?? 'postgresql://octagon@127.0.0.1:5432/octagon';
const parsed = new URL(databaseUrl);
const database = parsed.pathname.replace(/^\//, '');

const parts = [readFileSync(migrationSql, 'utf8')];
if (existsSync(extraSql)) {
  parts.push(readFileSync(extraSql, 'utf8'));
}

// psql читает SQL из файла: stdin-pipe в ограниченных средах может быть запрещен.
const combinedPath = join(repoRoot, '.tools', 'migration-combined.sql');
writeFileSync(combinedPath, parts.join('\n\n'), 'utf8');

console.log(`applying ${migrationSql}${existsSync(extraSql) ? ' + extra_constraints.sql' : ''}`);
console.log(`database: ${database} on ${parsed.hostname}:${parsed.port || 5432}`);

const result = spawnSync(
  psql,
  [
    '-h',
    parsed.hostname,
    '-p',
    parsed.port || '5432',
    '-U',
    decodeURIComponent(parsed.username),
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '--single-transaction',
    '-f',
    combinedPath,
  ],
  { encoding: 'utf8', stdio: 'inherit' },
);

if (result.error) {
  console.error(`Не удалось запустить psql: ${result.error.message}`);
  process.exit(1);
}
console.log(`psql exit code: ${result.status}`);
process.exit(result.status ?? 1);
