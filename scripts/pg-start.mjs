/**
 * Запускница локального PostgreSQL для разработки (docs/14-infrastructure.md).
 *
 * Песочницы и обвязки, запрещающие spawn с перенаправленными pipe, ломают
 * `pg_ctl start` (он запускает postgres.exe через pipe). Здесь процесс
 * запускается напрямую с stdio: 'inherit'.
 *
 * Запуск: node scripts/pg-start.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pgRoot = join(repoRoot, '.tools', 'pgsql');
const pgBin = join(pgRoot, 'bin');
const dataDir = process.env.PGDATA_DIR ?? join(repoRoot, '.tools', 'pgdata');
const port = process.env.PGPORT ?? '5432';
// Дополнительные параметры сервера, например отключение checkpoint'ов:
// PG_EXTRA_OPTS="-c checkpoint_timeout=0 -c max_wal_size=32GB"
const extraOptions = (process.env.PG_EXTRA_OPTS ?? '').split(' ').filter(Boolean);

if (!existsSync(join(dataDir, 'PG_VERSION'))) {
  console.error(`Кластер не найден: ${dataDir}. Сначала выполните initdb (см. docs/27-local-development.md).`);
  process.exit(1);
}

const args = ['-D', dataDir, '-p', port, '-c', 'timezone=UTC', ...extraOptions];

const child = spawn(join(pgBin, 'postgres.exe'), args, {
  stdio: 'inherit',
  windowsHide: true,
});

console.log(`postgres pid=${child.pid}, data=${dataDir}, port=${port}`);
if (extraOptions.length > 0) {
  console.log(`дополнительные параметры: ${extraOptions.join(' ')}`);
}

child.on('exit', (code, signal) => {
  console.log(`postgres завершился: code=${code} signal=${signal}`);
  process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
