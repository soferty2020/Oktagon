/**
 * Очистка демонстрационных данных.
 *
 * Удаляет бизнес-данные и всех пользователей, кроме суперадминистратора: записи
 * создавались скриптами проверок, и в базе накопились сотни «Группа 1791226564623».
 *
 * Выполняется через psql, а не через Prisma: `TRUNCATE ... CASCADE` одной
 * транзакцией проще и быстрее, чем удаление моделей по одной с риском наткнуться
 * на порядок внешних ключей.
 *
 * Запуск:
 *   node scripts/reset-demo.mjs
 * Затем наполнение:
 *   node scripts/demo-data.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const psql = join(repoRoot, '.tools', 'pgsql', 'bin', 'psql.exe');
const sqlFile = join(repoRoot, 'scripts', 'reset-demo.sql');

if (!existsSync(psql)) {
  console.error(`Не найден psql: ${psql}. См. docs/27-local-development.md.`);
  process.exit(1);
}

// Адрес базы берется из apps/api/.env — тот же, с которым работает API.
const env = readFileSync(join(repoRoot, 'apps', 'api', '.env'), 'utf8');
const databaseUrl =
  process.env.DATABASE_URL ?? env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();

if (!databaseUrl) {
  console.error('Не найден DATABASE_URL в apps/api/.env');
  process.exit(1);
}

const parsed = new URL(databaseUrl);
const database = parsed.pathname.replace(/^\//, '');

console.log(`очистка базы ${database} на ${parsed.hostname}:${parsed.port || 5432}`);

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
    sqlFile,
  ],
  { encoding: 'utf8', stdio: 'inherit' },
);

if (result.error) {
  console.error(`Не удалось запустить psql: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`psql завершился с кодом ${result.status}`);
  process.exit(result.status ?? 1);
}

console.log('готово: бизнес-данные очищены, суперадминистратор сохранен');
console.log('наполнить демо: node scripts/demo-data.mjs');
