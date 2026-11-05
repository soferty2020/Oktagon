/**
 * Снятие дампа базы (docs/14-infrastructure.md, «Backups»).
 *
 * Дамп снимается в формате custom и **сразу проверяется на читаемость**:
 * `pg_restore --list` разбирает оглавление архива. Это дешево и ловит обрыв
 * записи (кончилось место, прерванный процесс) — иначе битый файл обнаружился бы
 * только при восстановлении, то есть в момент аварии.
 *
 * `--no-owner` и `--no-privileges` обязательны: иначе дамп требует тех же ролей
 * БД, что и источник, и восстановление на другой площадке падает на «роль не
 * существует».
 *
 * Старые дампы удаляются по сроку хранения: без этого диск заполнится, и бэкапы
 * перестанут сниматься именно тогда, когда понадобятся.
 *
 * Использование:
 *   node scripts/backup-db.mjs [--out <dir>] [--keep-days <n>]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pgDump = join(rootDir, '.tools', 'pgsql', 'bin', 'pg_dump.exe');
const pgRestore = join(rootDir, '.tools', 'pgsql', 'bin', 'pg_restore.exe');

/** Значение аргумента вида `--key value`. */
function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  return index >= 0 && value ? value : fallback;
}

const outDir = resolve(
  argument('--out', process.env.BACKUP_DIR ?? join(rootDir, '.tools', 'backups')),
);
const keepDays = Number(argument('--keep-days', process.env.BACKUP_KEEP_DAYS ?? '14'));

if (!existsSync(pgDump)) {
  console.error(`Не найден pg_dump: ${pgDump}. См. docs/27-local-development.md.`);
  process.exit(1);
}

const envPath = join(rootDir, 'apps', 'api', '.env');
const line = readFileSync(envPath, 'utf8')
  .split(/\r?\n/)
  .find((entry) => entry.startsWith('DATABASE_URL='));

if (!line) {
  console.error('DATABASE_URL не найден в apps/api/.env');
  process.exit(1);
}

// Prisma добавляет `?schema=public`, которого libpq не понимает.
const databaseUrl = (process.env.DATABASE_URL ?? line.slice('DATABASE_URL='.length))
  .trim()
  .split('?')[0];
const database = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));

mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dumpPath = join(outDir, `${database}-${stamp}.dump`);

console.log(`База:    ${database}`);
console.log(`Дамп:    ${dumpPath}`);

try {
  execFileSync(
    pgDump,
    [
      '--format=custom',
      '--schema=public',
      '--no-owner',
      '--no-privileges',
      '--file',
      dumpPath,
      databaseUrl,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
} catch (error) {
  console.error(`Дамп не снят: ${String(error.message).slice(0, 300)}`);
  process.exit(1);
}

const size = statSync(dumpPath).size;
if (size === 0) {
  console.error('Дамп пустой: файл создан, но данных в нем нет.');
  unlinkSync(dumpPath);
  process.exit(1);
}

// Проверка читаемости: pg_restore разбирает оглавление архива и падает на битом
// файле. Без этого «успешный» дамп мог бы оказаться обрезанным.
let objects = 0;
try {
  const listing = execFileSync(pgRestore, ['--list', dumpPath], { encoding: 'utf8' });
  objects = listing.split(/\r?\n/).filter((row) => row !== '' && !row.startsWith(';')).length;
} catch (error) {
  console.error(`Дамп не читается: ${String(error.message).slice(0, 300)}`);
  process.exit(1);
}

console.log(`Снят:    ${(size / 1024).toFixed(0)} КиБ, объектов в архиве ${objects}`);

// Ротация: удаляются дампы старше срока хранения.
const cutoff = Date.now() - keepDays * 24 * 3600 * 1000;
let removed = 0;
for (const file of readdirSync(outDir)) {
  if (!file.endsWith('.dump')) {
    continue;
  }
  const path = join(outDir, file);
  if (statSync(path).mtimeMs < cutoff) {
    unlinkSync(path);
    removed += 1;
  }
}

console.log(`Хранение: ${keepDays} дн., удалено старых ${removed}`);
console.log('Проверка восстановления: node scripts/check-backup.mjs');
