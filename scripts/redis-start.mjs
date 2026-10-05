/**
 * Запуск локального Redis для разработки (docs/14-infrastructure.md).
 *
 * Redis используется для rate limiting auth-эндпоинтов (docs/15-security.md)
 * и кэша/очередей. В MVP обязателен только для rate limiting.
 *
 * Процесс запускается напрямую с stdio: 'inherit': в ограниченных средах
 * spawn с перенаправленными pipe запрещен.
 *
 * Запуск: node scripts/redis-start.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const redisRoot = join(repoRoot, '.tools', 'redis');
const port = process.env.REDIS_PORT ?? '6379';

function findServer() {
  if (!existsSync(redisRoot)) {
    return null;
  }

  // Плоская раскладка (например, tporadowski/redis) либо вложенный каталог
  // (redis-windows/redis-windows): ищем redis-server.exe на двух уровнях.
  const flat = join(redisRoot, 'redis-server.exe');
  if (existsSync(flat)) {
    return flat;
  }

  for (const entry of readdirSync(redisRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const nested = join(redisRoot, entry.name, 'redis-server.exe');
    if (existsSync(nested)) {
      return nested;
    }
  }
  return null;
}

const server = findServer();
if (!server) {
  console.error(
    `Не найден redis-server.exe в ${redisRoot}. Распакуйте Windows-сборку Redis (см. docs/27-local-development.md).`,
  );
  process.exit(1);
}

// appendonly no: для локальной разработки персистентность не нужна,
// данные rate limiting живут в памяти.
const child = spawn(server, ['--port', port, '--appendonly', 'no', '--save', ''], {
  stdio: 'inherit',
  windowsHide: true,
  cwd: dirname(server),
});

console.log(`redis-server pid=${child.pid}, port=${port}`);

child.on('exit', (code, signal) => {
  console.log(`redis-server завершился: code=${code} signal=${signal}`);
  process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
