/**
 * Загрузчик файлов по HTTPS на стандартном TLS-стеке Node.
 *
 * Нужен там, где клиент .NET (Invoke-WebRequest) не может установить TLS-соединение.
 *
 * Запуск: node scripts/download.mjs <url> <outPath>
 */
import { createWriteStream } from 'node:fs';
import { mkdir, rm, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const [url, outPathArg] = process.argv.slice(2);
if (!url || !outPathArg) {
  console.error('usage: node scripts/download.mjs <url> <outPath>');
  process.exit(2);
}

const outPath = resolve(outPathArg);
const tempPath = `${outPath}.part`;
await mkdir(dirname(outPath), { recursive: true });
await rm(tempPath, { force: true });

const response = await fetch(url);
if (!response.ok || !response.body) {
  throw new Error(`GET ${url} failed with status ${response.status}`);
}

const total = Number(response.headers.get('content-length') ?? 0);
let received = 0;
let lastReport = 0;

const body = Readable.fromWeb(response.body);
body.on('data', (chunk) => {
  received += chunk.length;
  const now = Date.now();
  if (now - lastReport > 5000) {
    lastReport = now;
    const percent = total > 0 ? ((received / total) * 100).toFixed(1) : '?';
    console.log(`${(received / 1048576).toFixed(1)} MiB / ${(total / 1048576).toFixed(1)} MiB (${percent}%)`);
  }
});

await pipeline(body, createWriteStream(tempPath));
await rename(tempPath, outPath);

console.log(`saved ${outPath} (${(received / 1048576).toFixed(1)} MiB)`);
