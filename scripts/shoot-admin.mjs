/**
 * Скриншоты админки через Chrome DevTools Protocol.
 *
 * Админка — обычный HTML (не canvas, как мобильное приложение), поэтому вход
 * можно автоматизировать: скрипт заполняет форму и отправляет ее через
 * `requestSubmit`. Cookies сессии после этого держит сам браузер, и следующие
 * страницы открываются уже авторизованными.
 *
 * Зачем: проверить оформление и что страница действительно отрисовалась, не
 * открывая браузер руками. Обычный headless-снимок (`chrome --screenshot`) здесь
 * не годится: он попадет на страницу входа.
 *
 * Требуется запущенная админка и Chrome с отладкой:
 *
 *   chrome --headless=new --remote-debugging-port=9222 --window-size=1500,1000 \
 *     --user-data-dir=.tools/chrome-admin http://127.0.0.1:3001/login
 *
 *   node scripts/shoot-admin.mjs http://127.0.0.1:3001 .tools/admin-shots /athletes /groups
 *
 * Учетные данные берутся из переменных `ADMIN_EMAIL`/`ADMIN_PASSWORD`, по
 * умолчанию — локальный супер-администратор из `.env.example`. Скрипт не
 * запускается в CI: там нет ни Chrome, ни живого API.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3001';
const outDir = process.argv[3] ?? '.tools/admin-shots';
const pages = process.argv.slice(4);
const debugPort = process.env.CHROME_DEBUG_PORT ?? '9222';
const email = process.env.ADMIN_EMAIL ?? 'superadmin@octagon.local';
const password = process.env.ADMIN_PASSWORD ?? 'ChangeMe-Octagon-2026!';

mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function listTargets() {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
  return response.json();
}

/** Подключение к странице и минимальный клиент CDP. */
async function connect() {
  const targets = await listTargets();
  const page = targets.find((target) => target.type === 'page');
  if (!page) {
    throw new Error('В Chrome нет открытой страницы');
  }

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve);
    socket.addEventListener('error', reject);
  });

  let nextId = 0;
  const pending = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const resolver = pending.get(message.id);
    if (resolver) {
      pending.delete(message.id);
      resolver(message);
    }
  });

  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, (message) => {
        if (message.error) {
          reject(new Error(`${method}: ${JSON.stringify(message.error)}`));
        } else {
          resolve(message.result);
        }
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  return { call, close: () => socket.close() };
}

async function shoot(cdp, name, fullPage) {
  // captureBeyondViewport: страница дашборда выше окна, и без этого в кадр
  // попадала бы только видимая часть. Для списков с сотнями строк он вреден:
  // получается картинка высотой в несколько тысяч пикселей.
  const { data } = await cdp.call('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: fullPage,
  });
  const path = `${outDir}/${name}.png`;
  writeFileSync(path, Buffer.from(data, 'base64'));
  console.log(`  сохранен: ${path}`);
}

const cdp = await connect();

await cdp.call('Page.enable');
await cdp.call('Runtime.enable');

console.log('вход в админку...');
await cdp.call('Page.navigate', { url: `${baseUrl}/login` });
await sleep(2500);

await cdp.call('Runtime.evaluate', {
  expression: `
    (() => {
      const email = document.querySelector('input[name=email]');
      const password = document.querySelector('input[name=password]');
      if (!email || !password) return 'fields not found';
      email.value = ${JSON.stringify(email)};
      password.value = ${JSON.stringify(password)};
      document.querySelector('form').requestSubmit();
      return 'submitted';
    })()
  `,
  awaitPromise: true,
});

await sleep(4000);

const path = await cdp.call('Runtime.evaluate', {
  expression: 'location.pathname',
  returnByValue: true,
});
console.log(`  после входа: ${path.result.value}`);

const targets = [
  ['dashboard', '/'],
  ...pages.map((page) => [page.replace(/\//g, '_').replace(/^_/, '') || 'root', page]),
];

for (const [name, pagePath] of targets) {
  await cdp.call('Page.navigate', { url: `${baseUrl}${pagePath}` });
  await sleep(2200);
  await shoot(cdp, name, pagePath === '/');
}

cdp.close();
console.log('готово');
