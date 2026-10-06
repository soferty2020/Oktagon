/**
 * Проверка восстановления из бэкапа (J2, docs/14-infrastructure.md).
 *
 * Проверяется **процедура**, а не наличие файла: снимается дамп рабочей базы,
 * восстанавливается в отдельную базу, и результат сверяется с источником.
 * Непроверенный дамп — это не бэкап, а надежда: типичный провал в том, что дамп
 * снимается, но не восстанавливается (несовпадение версий, потерянные
 * последовательности, забытая роль), и выясняется это в момент аварии.
 *
 * Что сверяется:
 * - количество строк в каждой таблице public-схемы (источник против копии);
 * - структура схемы: индексы, внешние ключи, enum;
 * - внешние ключи: в копии не должно быть нарушенных ссылок;
 * - пригодность к работе: **API запускается на восстановленной базе** и
 *   обслуживает запросы. Совпавшие строки еще не значат, что приложение
 *   заработает: дамп мог не содержать нужных объектов, а данные — не проходить
 *   проверки, которые выполняет код.
 *
 * Копия создается с суффиксом `_restore` и удаляется в конце, чтобы проверку
 * можно было запускать многократно. Рабочая база не изменяется: дамп снимается
 * без блокировок записи (pg_dump по умолчанию).
 *
 * Использование:
 *   node scripts/check-backup.mjs [--keep] [--dump <path>] [--skip-api]
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pgBin = join(rootDir, '.tools', 'pgsql', 'bin');
const pgDump = join(pgBin, 'pg_dump.exe');
const pgRestore = join(pgBin, 'pg_restore.exe');
const psql = join(pgBin, 'psql.exe');

const keep = process.argv.includes('--keep');
const skipApi = process.argv.includes('--skip-api');
const dumpArgIndex = process.argv.indexOf('--dump');
const dumpPath =
  dumpArgIndex >= 0 && process.argv[dumpArgIndex + 1]
    ? resolve(process.argv[dumpArgIndex + 1])
    : join(rootDir, '.tools', 'backup-check.dump');

const failures = [];

/** Печатает шаг и запоминает падение. */
function step(title, condition, detail = '') {
  if (!condition) {
    failures.push(title);
  }
  console.log(`${condition ? '✔' : '✖'} ${title}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Читает `DATABASE_URL` из `apps/api/.env`.
 *
 * Скрипт не требует ручного экспорта переменной: проверку восстановления должны
 * уметь запускать все, а не только тот, кто помнит про `.env`.
 */
function readDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envPath = join(rootDir, 'apps', 'api', '.env');
  const line = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.startsWith('DATABASE_URL='));

  if (!line) {
    throw new Error('DATABASE_URL не найден ни в окружении, ни в apps/api/.env');
  }
  return line.slice('DATABASE_URL='.length).trim();
}

/**
 * Приводит URL Prisma к формату libpq.
 *
 * Prisma добавляет `?schema=public`, которого libpq не понимает, и psql/pg_dump
 * падают с «invalid URI query parameter». Параметр отбрасывается: схема public и
 * так используется по умолчанию.
 */
function toLibpqUrl(prismaUrl) {
  const [base] = prismaUrl.split('?');
  return base;
}

/** Заменяет имя базы в URL, сохраняя пользователя, хост и порт. */
function withDatabase(url, database) {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/** Имя базы из URL. */
function databaseName(url) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

/** Запускает утилиту PostgreSQL, возвращая stdout. */
function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

/** Выполняет SQL и возвращает строки, разделенные переводом строки. */
function query(url, sql) {
  const output = run(psql, ['--no-psqlrc', '-t', '-A', '-F', '|', '-c', sql, url]);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** Считает строки в каждой таблице схемы public. */
function tableCounts(url) {
  const tables = query(
    url,
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;`,
  );

  const counts = new Map();
  for (const table of tables) {
    const [row] = query(url, `SELECT count(*) FROM public."${table}";`);
    counts.set(table, Number(row));
  }
  return counts;
}

/**
 * Снимок последовательностей: имя и текущее значение.
 *
 * Сверяется отдельно от строк: если последовательность не восстановлена, новые
 * записи получат уже занятые идентификаторы, и приложение упадет на конфликте
 * первичного ключа — при этом количество строк в дампе будет верным.
 */
function sequenceState(url) {
  const rows = query(
    url,
    `SELECT c.relname || '=' || s.last_value
       FROM pg_sequences s
       JOIN pg_class c ON c.relname = s.sequencename
      WHERE s.schemaname = 'public'
      ORDER BY c.relname;`,
  );

  return new Map(rows.map((row) => row.split('=')));
}

/**
 * Снимок структуры схемы: объекты, которые должны пережить восстановление.
 *
 * История миграций (`_prisma_migrations`) сверяется отдельно и может
 * отсутствовать: в локальной среде миграции применяются SQL-скриптом в обход
 * `prisma migrate` (docs/27-local-development.md). Поэтому полнота схемы
 * проверяется по самим объектам, а не по записям об их применении.
 */
function schemaSnapshot(url) {
  // `uniqueConstraints` считается по `contype = 'u'` (ограничения, объявленные
  // через ALTER TABLE). В этой схеме уникальность задается уникальными
  // индексами Prisma, поэтому значение обычно 0 — уникальные индексы уже входят
  // в `indexes`.
  const [tables, indexes, foreignKeys, enums, uniqueConstraints] = [
    `SELECT count(*) FROM pg_tables WHERE schemaname = 'public';`,
    `SELECT count(*) FROM pg_indexes WHERE schemaname = 'public';`,
    `SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f';`,
    `SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e';`,
    `SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'u';`,
  ].map((sql) => Number(query(url, sql)[0]));

  return { tables, indexes, foreignKeys, enums, uniqueConstraints };
}

/** Примененные миграции Prisma. `null`, если истории нет. */
function appliedMigrations(url) {
  const exists = query(url, `SELECT to_regclass('public._prisma_migrations') IS NOT NULL;`)[0];

  if (exists !== 't') {
    return null;
  }

  return query(
    url,
    `SELECT migration_name || ':' || COALESCE(finished_at::text, 'pending')
       FROM public._prisma_migrations
      ORDER BY migration_name;`,
  );
}

/** Количество нарушений внешних ключей в базе. */
function foreignKeyViolations(url) {
  // Проверяются все FK схемы public динамически: ограничения выводятся из
  // каталога, чтобы проверка не устаревала при добавлении таблиц.
  const constraints = query(
    url,
    `SELECT tc.table_name || '|' || kcu.column_name || '|' || ccu.table_name || '|' || ccu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';`,
  );

  let violations = 0;
  for (const entry of constraints) {
    const [childTable, childColumn, parentTable, parentColumn] = entry.split('|');
    const [row] = query(
      url,
      `SELECT count(*) FROM public."${childTable}" c
         LEFT JOIN public."${parentTable}" p ON p."${parentColumn}" = c."${childColumn}"
        WHERE c."${childColumn}" IS NOT NULL AND p."${parentColumn}" IS NULL;`,
    );
    violations += Number(row);
  }

  return { violations, checked: constraints.length };
}

async function main() {
  const sourceUrl = toLibpqUrl(readDatabaseUrl());
  const sourceDb = databaseName(sourceUrl);
  const restoreDb = `${sourceDb}_restore`;
  const adminUrl = withDatabase(sourceUrl, 'postgres');
  const restoreUrl = withDatabase(sourceUrl, restoreDb);

  console.log(`Источник: ${sourceDb}`);
  console.log(`Копия:    ${restoreDb}\n`);

  step(
    'утилиты PostgreSQL на месте',
    existsSync(pgDump) && existsSync(pgRestore) && existsSync(psql),
  );

  // --- Снимок источника ---------------------------------------------------

  const sourceCounts = tableCounts(sourceUrl);
  const sourceSequences = sequenceState(sourceUrl);
  const sourceMigrations = appliedMigrations(sourceUrl);
  const sourceSchema = schemaSnapshot(sourceUrl);

  step(
    'источник прочитан',
    sourceCounts.size > 0,
    `таблиц ${sourceCounts.size}, строк ${[...sourceCounts.values()].reduce((sum, value) => sum + value, 0)}, индексов ${sourceSchema.indexes}, внешних ключей ${sourceSchema.foreignKeys}`,
  );

  // Отсутствие истории миграций — не ошибка проверки, но и не то, о чем стоит
  // молчать: структура тогда сверяется по объектам, а не по записям об их
  // применении.
  if (sourceMigrations === null) {
    console.log(
      '  ℹ истории миграций в источнике нет (локальный способ применения в обход prisma migrate):\n' +
        '    полнота схемы проверяется по самим объектам — индексам, ключам и enum.',
    );
  }

  // --- Дамп ---------------------------------------------------------------

  mkdirSync(dirname(dumpPath), { recursive: true });
  if (existsSync(dumpPath)) {
    unlinkSync(dumpPath);
  }

  // Формат custom: восстанавливается выборочно и с проверкой, в отличие от
  // plain-SQL. Схема public: остальные схемы приложению не принадлежат.
  run(pgDump, [
    '--format=custom',
    '--schema=public',
    '--no-owner',
    '--no-privileges',
    '--file',
    dumpPath,
    sourceUrl,
  ]);

  const dumpSize = statSync(dumpPath).size;
  step('дамп снят', dumpSize > 0, `${(dumpSize / 1024).toFixed(0)} КиБ, формат custom`);

  // --- Восстановление в отдельную базу ------------------------------------

  // База копии пересоздается: остатки прошлой проверки исказили бы сверку.
  run(psql, [
    '--no-psqlrc',
    '-c',
    `DROP DATABASE IF EXISTS "${restoreDb}" WITH (FORCE);`,
    adminUrl,
  ]);
  run(psql, ['--no-psqlrc', '-c', `CREATE DATABASE "${restoreDb}";`, adminUrl]);

  let restoreExitCode = 0;
  let restoreStderr = '';
  try {
    run(pgRestore, [
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
      // `--clean --if-exists` обязателен: дамп создает схему public, а она в
      // целевой базе уже есть, и без этих флагов восстановление падает с
      // «схема public уже существует». Именно так этот дамп и не восстановился
      // бы в реальной аварии — проверка нашла это до релиза.
      '--clean',
      '--if-exists',
      '--no-comments',
      '--dbname',
      restoreUrl,
      dumpPath,
    ]);
  } catch (error) {
    restoreExitCode = error.status ?? 1;
    restoreStderr = String(error.stderr ?? error.message).slice(0, 500);
  }

  step(
    'дамп восстановлен в отдельную базу',
    restoreExitCode === 0,
    restoreExitCode === 0 ? `база ${restoreDb}` : `код ${restoreExitCode}: ${restoreStderr}`,
  );

  if (restoreExitCode !== 0) {
    console.log('\nВосстановление не удалось: сверять нечего.');
    cleanup(adminUrl, restoreDb);
    finish();
    return;
  }

  // --- Сверка -------------------------------------------------------------

  const restoreCounts = tableCounts(restoreUrl);

  const missingTables = [...sourceCounts.keys()].filter((table) => !restoreCounts.has(table));
  const countMismatches = [...sourceCounts.entries()].filter(
    ([table, count]) => restoreCounts.get(table) !== count,
  );

  step(
    'все таблицы восстановлены',
    missingTables.length === 0,
    missingTables.length > 0
      ? `нет таблиц: ${missingTables.join(', ')}`
      : `таблиц ${restoreCounts.size}`,
  );

  step(
    'количество строк совпадает по каждой таблице',
    countMismatches.length === 0,
    countMismatches.length > 0
      ? countMismatches
          .map(([table, count]) => `${table}: ${count} → ${restoreCounts.get(table)}`)
          .join('; ')
      : `сверено таблиц ${sourceCounts.size}`,
  );

  // Последовательности: без них новые записи получат занятые идентификаторы.
  const restoreSequences = sequenceState(restoreUrl);
  const sequenceMismatches = [...sourceSequences.entries()].filter(
    ([name, value]) => restoreSequences.get(name) !== value,
  );

  step(
    'последовательности не отстают от данных',
    sequenceMismatches.length === 0,
    sequenceMismatches.length > 0
      ? sequenceMismatches
          .map(([name, value]) => `${name}: ${value} → ${restoreSequences.get(name)}`)
          .join('; ')
      : sourceSequences.size === 0
        ? 'последовательностей нет: идентификаторы — UUID (gen_random_uuid)'
        : `последовательностей ${sourceSequences.size}`,
  );

  const restoreMigrations = appliedMigrations(restoreUrl);
  if (sourceMigrations === null) {
    // Истории нет в источнике: сверять нечего, но структура уже проверена выше.
    step(
      'история миграций переносится вместе с дампом',
      restoreMigrations === null,
      'в источнике истории нет',
    );
  } else {
    step(
      'история миграций переносится вместе с дампом',
      JSON.stringify(sourceMigrations) === JSON.stringify(restoreMigrations),
      `применено ${restoreMigrations?.length ?? 0}`,
    );
  }

  const restoreSchema = schemaSnapshot(restoreUrl);
  const schemaDiff = Object.entries(sourceSchema).filter(
    ([key, value]) => restoreSchema[key] !== value,
  );

  step(
    'структура схемы совпадает',
    schemaDiff.length === 0,
    schemaDiff.length > 0
      ? schemaDiff.map(([key, value]) => `${key}: ${value} → ${restoreSchema[key]}`).join('; ')
      : `индексов ${restoreSchema.indexes} (включая уникальные), внешних ключей ${restoreSchema.foreignKeys}, enum ${restoreSchema.enums}`,
  );

  const { violations, checked } = foreignKeyViolations(restoreUrl);
  step(
    'внешние ключи не нарушены',
    violations === 0,
    violations === 0 ? `проверено связей ${checked}` : `нарушений ${violations}`,
  );

  // Пригодность к работе: строки совпали, но система должна еще и подняться.
  if (skipApi) {
    console.log('  ℹ проверка пригодности пропущена (--skip-api)');
  } else {
    await checkApiOnRestore(restoreUrl, sourceUrl);
  }

  cleanup(adminUrl, restoreDb);
  finish();
}

/**
 * Проверяет, что API действительно работает на восстановленной базе.
 *
 * Сверка строк отвечает на вопрос «данные на месте», но не на вопрос «система
 * поднимется». Здесь запускается собранный API с `DATABASE_URL` копии, и
 * проверяются два обращения: readiness (база и Redis) и вход существующего
 * пользователя — второй проверяет чтение реальных данных, а не только соединение.
 *
 * Если сборки нет, проверка пропускается с пояснением: молчаливое «ок» здесь
 * было бы хуже, чем честный пропуск.
 */
async function checkApiOnRestore(restoreUrl, sourceUrl) {
  const apiEntry = join(rootDir, 'apps', 'api', 'dist', 'main.js');
  if (!existsSync(apiEntry)) {
    console.log(
      '  ℹ сборка API не найдена (apps/api/dist/main.js): проверка пригодности пропущена',
    );
    return;
  }

  const port = 3_15_0;
  const child = spawn(process.execPath, [apiEntry], {
    cwd: join(rootDir, 'apps', 'api'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      DATABASE_URL: restoreUrl,
    },
    // Вывод нужен только при разборе падения: держать его в памяти безопасно,
    // здесь это ограниченный объем.
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout?.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk) => {
    output += chunk.toString();
  });

  const stop = () => {
    if (!child.killed) {
      child.kill();
    }
  };

  try {
    const base = `http://127.0.0.1:${port}/api/v1`;

    // Ожидание старта: приложение поднимает соединения и проверяет окружение.
    const ready = await waitFor(async () => {
      const response = await fetch(`${base}/health/ready`).catch(() => null);
      return response?.ok ? response : null;
    }, 30_000);

    if (!ready) {
      step(
        'API поднимается на восстановленной базе',
        false,
        `не дождались готовности. Вывод: ${output.split(/\r?\n/).slice(-4).join(' | ').slice(0, 300)}`,
      );
      return;
    }

    step('API поднимается на восстановленной базе', true, 'readiness отвечает ok');

    // Вход существующего пользователя: проверяет чтение восстановленных данных,
    // а не только доступность соединения.
    const credentials = readTestCredentials(sourceUrl);
    if (!credentials) {
      console.log('  ℹ пользователь для проверки входа не найден: чтение данных не проверено');
      return;
    }

    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    const body = await login.json().catch(() => null);
    step(
      'на восстановленной базе выполняется вход',
      login.ok && Boolean(body?.accessToken),
      login.ok
        ? `пользователь ${credentials.email}`
        : `статус ${login.status}: ${body?.code ?? 'без кода'}`,
    );
  } finally {
    stop();
  }
}

/** Ждет, пока функция вернет значение, или истекает таймаут. */
async function waitFor(probe, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await probe();
    if (result) {
      return result;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  return null;
}

/**
 * Данные для проверки входа.
 *
 * Аккаунт не создается: проверка не должна менять восстановленную базу, иначе
 * сверка с источником потеряла бы смысл. Если передан пароль администратора в
 * окружении — используется он; иначе проверка входа пропускается.
 */
function readTestCredentials() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    return null;
  }
  return { email, password };
}

/** Удаляет базу копии, если не запрошено ее сохранение. */
function cleanup(adminUrl, restoreDb) {
  if (keep) {
    console.log(`\nБаза копии сохранена: ${restoreDb} (--keep)`);
    return;
  }

  try {
    run(psql, [
      '--no-psqlrc',
      '-c',
      `DROP DATABASE IF EXISTS "${restoreDb}" WITH (FORCE);`,
      adminUrl,
    ]);
    console.log(`\nБаза копии удалена: ${restoreDb}`);
  } catch (error) {
    console.log(`\nНе удалось удалить базу копии: ${String(error.message).slice(0, 200)}`);
  }
}

function finish() {
  if (failures.length > 0) {
    console.log(`\nПровалено проверок: ${failures.length}`);
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\nВосстановление из бэкапа проверено.');
  }
}

main();
