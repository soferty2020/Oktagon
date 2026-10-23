# 27. Local Development

Практическое руководство по запуску монорепо на машине разработчика.
Основание: `docs/14-infrastructure.md`, `docs/15-security.md` (секреты не в git).

## 1. Требования

| Компонент | Версия | Комментарий |
| --- | --- | --- |
| Node.js | >= 22 | проверка: `node --version` |
| pnpm | 10.x | `corepack enable pnpm`, либо локальная установка (см. ниже) |
| PostgreSQL | 16 | локально, встроенно или через `docker compose up -d postgres redis` |

## 2. Установка зависимостей

```bash
pnpm install
```

### Раскладка node_modules

В `.npmrc` задано `node-linker=hoisted` — классическая npm-подобная раскладка.

Причина: при изолированной раскладке pnpm рантайм не находил транзитивные
зависимости `@nestjs/common` (`tslib`, `uid`), из-за чего собранный
`dist/main.js` падал с `Cannot find module`. Для приложений, которые запускаются
напрямую через `node dist/...`, hoisted-раскладка надежнее.

### Если `corepack enable` недоступен

В ограниченных средах запись в глобальные каталоги может быть запрещена. Тогда
pnpm можно распаковать внутрь проекта и вызывать напрямую:

```bash
COREPACK_HOME=.tools/corepack corepack prepare pnpm@10.18.0 --activate
node .tools/corepack/v1/pnpm/10.18.0/bin/pnpm.cjs install
```

В `.npmrc` store и cache уже направлены в `.tools/`, поэтому pnpm не пишет за
пределы проекта.

### Установка без lifecycle-скриптов

Если среда запрещает spawn дочерних процессов с pipe, `pnpm install` падает на
postinstall `@prisma/client`. В этом случае:

```bash
pnpm install --ignore-scripts
pnpm db:generate
```

Prisma Client генерируется в `apps/api/generated/prisma` (явный `output` в
schema), поэтому каталог `.prisma` в store не нужен — см. ниже.

## 3. PostgreSQL

### Вариант A: Docker

```bash
docker compose up -d postgres redis
```

Пользователь, пароль и БД по умолчанию — `octagon`. Дополнительно создается
`octagon_test` для e2e.

### Вариант B: portable-сборка в `.tools/`

Если Docker недоступен, можно распаковать официальные бинарники PostgreSQL в
`.tools/pgsql` (каталог `.tools/` исключен из git):

```bash
# initdb создает кластер в .tools/pgdata
# Collation задается через ICU: при collation C регистронезависимый поиск
# (ILIKE) не сворачивает регистр кириллицы, и поиск по ФИО молча не работает.
# IPC-локаль не зависит от 8-битных кодировок ОС (Windows по умолчанию дает
# Russian_Russia.1251) и совпадает с docker-compose.yml и CI.
.tools/pgsql/bin/initdb -D .tools/pgdata -U octagon -A trust -E UTF8 \
  --locale-provider=icu --icu-locale=en-US

# запуск сервера на 5432 с timezone UTC
node scripts/pg-start.mjs

# базы
.tools/pgsql/bin/psql -h 127.0.0.1 -U octagon -d postgres \
  -c 'CREATE DATABASE octagon OWNER octagon' \
  -c 'CREATE DATABASE octagon_test OWNER octagon'
```

Проверить collation текущего кластера:

```sql
SELECT datname, datcollate, datlocprovider FROM pg_database WHERE datname LIKE 'octagon%';
SELECT 'Тренеров' ILIKE '%тренеров%' AS поиск_работает;
```

`datlocprovider = 'c'` вместе с `datcollate = 'C'` означает, что поиск по
кириллице в нижнем регистре не найдет записи: кластер нужно пересоздать с
ICU-локалью. Та же collation задана в `docker-compose.yml` и в CI.

`scripts/pg-start.mjs` запускает `postgres.exe` напрямую с `stdio: inherit`:
`pg_ctl start` в ограниченных средах не работает, потому что запускает сервер
через pipe.

### Важно для ограниченных сред

PostgreSQL должен запускаться **вне песочницы**, если среда запрещает процессам
отправлять сигналы друг другу. Симптомы: `DROP DATABASE` падает с
`could not signal for checkpoint: Operation not permitted`, после чего база
попадает в состояние `invalid` и перестает принимать подключения; при старте
сервера recovery завершается `could not signal for checkpoint` и сервер
выключается.

В таких средах запускайте сервер с длинным интервалом checkpoint'ов:

```bash
# PG_EXTRA_OPTS передается в postgres как дополнительные -c параметры
PG_EXTRA_OPTS="-c checkpoint_timeout=86400 -c max_wal_size=32GB" node scripts/pg-start.mjs
```

Значение `checkpoint_timeout` ограничено диапазоном 30..86400 секунд, ноль
недопустим. Это компромисс для локальной разработки: сервер запускается
штатно, но checkpoint'ы почти не выполняются.

Если база все же оказалась в состоянии `invalid` (сообщение
`cannot connect to invalid database`), ее нужно удалить и создать заново:

```bash
.tools/pgsql/bin/psql -h 127.0.0.1 -U octagon -d postgres \
  -c 'DROP DATABASE IF EXISTS octagon_test' \
  -c 'CREATE DATABASE octagon_test OWNER octagon'
```

## 3a. Redis

Redis нужен для rate limiting auth-эндпоинтов (`docs/15-security.md`) и
кэша/очередей (`docs/14-infrastructure.md`). В MVP обязателен для rate limiting.

### Вариант A: Docker

Поднимается вместе с PostgreSQL: `docker compose up -d postgres redis`.

### Вариант B: portable-сборка в `.tools/redis`

```bash
# нативная Windows-сборка (без msys), например tporadowski/redis 5.0.14.1
node scripts/download.mjs <url-сборки> .tools/redis.zip
tar -xf .tools/redis.zip -C .tools/redis

# запуск на 6379 без персистентности
node scripts/redis-start.mjs
```

Проверка: `.tools/redis/redis-cli.exe -p 6379 ping` должен ответить `PONG`.

Важно про выбор сборки: msys2-варианты (`redis-windows/redis-windows`) в
ограниченных средах не запускаются — их `msys-2.0.dll` не может создать signal
pipe (`couldn't create signal pipe, Win32 error 5`). Используйте нативную
Windows-сборку.

Для rate limiting нужны только `INCR`, `EXPIRE` и `TTL`, поэтому версия Redis
не критична: локально достаточно 5.0, а `docker-compose.yml` использует
`redis:7-alpine`.

Если `REDIS_URL` не задан, приложение работает, а readiness-проба не проверяет
Redis. Если задан — Redis становится обязательной зависимостью readiness.

## 4. Окружение backend

```bash
cp apps/api/.env.example apps/api/.env
```

Замените в `apps/api/.env`:

- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — минимум 32 символа;
- `DATABASE_URL` — под ваш PostgreSQL;
- `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `SUPERADMIN_NAME` — для `db:seed`.

Файл `.env` исключен из git. Приложение валидирует окружение на старте и
отказывается подниматься при неполной конфигурации.

## 5. Схема БД, миграции, справочные данные

```bash
pnpm db:generate   # Prisma Client -> apps/api/generated/prisma
pnpm db:migrate    # prisma migrate dev
pnpm db:seed       # permissions, суперадмин, филиал-заглушка
```

### Если schema-engine заблокирован средой

`prisma migrate` запускает нативный `schema-engine-windows.exe`. В средах, где
spawn исполняемых файлов запрещен, миграция падает с `spawn EPERM`. Обход
(использовался при создании репозитория):

```bash
# 1. SQL первой миграции из схемы
node_modules/.bin/prisma migrate diff \
  --from-empty --to-schema-datamodel apps/api/prisma/schema.prisma \
  --script --output apps/api/prisma/migrations/20260101000000_init/migration.sql

# 2. применение напрямую через psql
node scripts/apply-migration.mjs apps/api/prisma/migrations/20260101000000_init
```

Тот же `migrate diff` используется при изменении схемы: сгенерированный SQL
проверяется и коммитится как новая миграция. В обычном окружении применяйте
штатные `pnpm db:migrate` / `pnpm db:deploy`.

### Ограничения, не выражаемые в Prisma schema

`docs/08-database.md` требует двух ограничений, которые Prisma не умеет
описывать:

1. не более одной активной `GroupMembership` на спортсмена;
2. не более одного открытого `FreezePeriod` на спортсмена.

Они реализованы частичными уникальными индексами PostgreSQL и **включены в
конец `migration.sql`**. Это принципиально: Prisma применяет только
`migration.sql`, поэтому файл-сосед `extra_constraints.sql` штатными средствами
(`prisma migrate deploy`) не выполнялся бы, и индексы не создались бы на staging
и production.

`extra_constraints.sql` остается в каталоге как копия для чтения. Если
миграция пересоздается через `prisma migrate diff`, блок нужно вернуть в
`migration.sql`:

```bash
node scripts/compose-migration.mjs 20260101000000_init
```

Скрипт сохраняет сгенерированный SQL в `migration.base.sql`, дописывает блок
ограничений и проверяет, что он попал ровно один раз.

## 6. Запуск API

```bash
pnpm --filter @octagon/api start:dev   # watch-режим
pnpm --filter @octagon/api build && pnpm --filter @octagon/api start:prod
```

- API: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/api/v1/docs`
- OpenAPI JSON: `http://localhost:3000/api/v1/openapi.json`

Контракт для клиентов лежит в `openapi.yaml` в корне репозитория и
проверяется командой `pnpm openapi:validate`. Swagger UI строится из
декораторов и служит для ручных проб: схемы ответов там неполны, потому что
контроллеры возвращают типы из `packages/contracts`. Источник истины для
генерации клиентов — `openapi.yaml`.

Проверка живости:

```bash
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/v1/health/ready
```

## 7. Проверки

```bash
pnpm build       # packages + api
pnpm typecheck
pnpm test        # unit-тесты
pnpm test:e2e    # e2e (нужны PostgreSQL и Redis)
pnpm lint        # Biome
```

На Linux/macOS те же шаги выполняет `bash scripts/ci-verify.sh` — он же
используется как образец для CI.

В средах, где вложенный `pnpm <script>` не может запустить дочерний процесс,
используйте `scripts/verify.ps1` — он вызывает компилятор и раннеры напрямую:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify.ps1
```

### Тестовая база данных

e2e-тесты создают и удаляют свои данные, поэтому им нужна отдельная база
(`octagon_test`). Адреса по умолчанию — в `apps/api/test/setup-env.ts`; их можно
переопределить переменными `TEST_DATABASE_URL` и `TEST_REDIS_URL`.

Схема тестовой базы создается теми же миграциями, что и рабочая:

```bash
psql -h localhost -U octagon -d postgres -c "CREATE DATABASE octagon_test OWNER octagon"
DATABASE_URL="postgresql://octagon:octagon@localhost:5432/octagon_test" pnpm db:deploy:test
```

## 8. Web-админка (`apps/admin`)

Next.js 16 (App Router) + React 19 + Tailwind CSS 4. Админка не обращается к
backend напрямую из браузера: все запросы идут через route handler
`/api/proxy/...`, который подставляет access-токен.

### Почему через прокси

Токены хранятся в `httpOnly`-cookie, поэтому JavaScript страницы их не видит, а
backend не нужен CORS (docs/15-security.md). Если access-токен истек, прокси
один раз обновляет его по refresh-токену и повторяет запрос: иначе
пользователя выкидывало бы из системы каждые 15 минут.

### Запуск

```bash
# backend должен быть запущен (раздел 6)
cd apps/admin
cp .env.example .env.local     # при необходимости измените API_BASE_URL
pnpm dev                       # http://localhost:3001
```

`API_BASE_URL` (по умолчанию `http://localhost:3000/api/v1`) используется
только серверной частью админки и в браузер не попадает.

### Типы из контракта

Типы API генерируются из `openapi.yaml`, поэтому расхождение с backend видно на
сборке, а не в рантайме:

```bash
pnpm --filter @octagon/admin api:types   # → apps/admin/src/lib/api/schema.d.ts
```

Файл `schema.d.ts` коммитится: CI проверяет, что он не устарел относительно
контракта. После изменения `openapi.yaml` команду нужно выполнить повторно.

### Ограничение: сборка Next в изолированных средах

`next build` и `next dev` запускают вспомогательный процесс с pipe. Там, где
такой запуск запрещен, они падают с `spawn EPERM`. Запускайте их вне песочницы;
`scripts/verify.ps1` по умолчанию выполняет только проверку типов админки, а
сборку — с флагом `-IncludeAdminBuild`.

Важно: в dev-режиме `next build`, запущенный в том же каталоге, переписывает
`.next` и ломает уже работающий dev-сервер — тот начинает отвечать
`Failed to find Server Action` на отправку форм. После сборки dev-сервер нужно
перезапустить.

### Проверка экранов по HTTP

`scripts/check-admin.mjs` (разделы админки) и `scripts/check-admin-finance.mjs`
(экраны финансов) повторяют то, что делает браузер: разбирают скрытые поля
server action и отправляют форму. Условие, без которого проверка не работает:
адрес админки должен совпадать с заголовком `origin`. Next отклоняет server
actions без этого заголовка, а `localhost` и `127.0.0.1` для него — разные
источники, поэтому проверяемый адрес передается аргументом и используется и как
база, и как origin.

Запуск при поднятых backend и админке:

```bash
node scripts/check-admin.mjs http://localhost:3001 http://127.0.0.1:3000/api/v1
node scripts/check-admin-finance.mjs http://localhost:3001 http://127.0.0.1:3000/api/v1
```

### Скриншоты админки

Проверить, что страница действительно отрисовалась (а не только вернула 200),
можно снимками через Chrome DevTools Protocol. Обычный `chrome --headless
--screenshot` не подходит: он попадет на страницу входа.

```bash
# 1. Chrome с отладочным портом
chrome --headless=new --remote-debugging-port=9222 --window-size=1500,1000 \
  --user-data-dir=.tools/chrome-admin http://127.0.0.1:3001/login

# 2. Вход и снимки
node scripts/shoot-admin.mjs http://127.0.0.1:3001 .tools/admin-shots /athletes /groups /finance
```

Скрипт сам входит под локальным супер-администратором (`ADMIN_EMAIL` /
`ADMIN_PASSWORD`, по умолчанию — значения из `.env.example`), затем снимает
обзор и перечисленные разделы. В CI не запускается: там нет ни Chrome, ни живого
API.

## 9. CI

`.github/workflows/ci.yml` запускается на push и pull request и состоит из двух
job'ов:

- **verify** — сервисы `postgres:16-alpine` и `redis:7-alpine`, затем установка
  зависимостей, генерация Prisma Client, миграция тестовой базы, lint,
  typecheck, unit-тесты, сборка API и e2e;
- **admin** — установка зависимостей, генерация типов из контракта (с проверкой,
  что `schema.d.ts` не устарел), lint, typecheck и сборка админки. Отдельный job
  не требует БД и быстрее показывает, что именно сломалось.

Локально те же шаги выполняет `bash scripts/ci-verify.sh`.

Ограничение: применение миграций в CI использует штатный `prisma migrate
deploy` (schema-engine там доступен). В ограниченных средах, где запуск
нативных бинарников запрещен, применяйте SQL через
`node scripts/apply-migration.mjs <migrationDir>` (см. раздел 5). Поэтому
важно, чтобы `migration.sql` был самодостаточным.

## 10. Линтер и форматтер

- **Biome** (`biome.json`) — линтер. Выбран вместо ESLint: ESLint 9.39 в
  pnpm-раскладке конфликтует с `ajv` (`Cannot set properties of undefined
  (setting 'defaultMeta')`). Biome не требует плагинов и не зависит от ajv.
- **Prettier** (`.prettierrc.json`) — форматирование, отдельной командой
  `pnpm format`.

## 11. Redis в коде

- `RedisModule` (`apps/api/src/redis`) — глобальный модуль с единственным
  клиентом ioredis;
- подключение ленивое: отсутствие Redis не мешает приложению подняться;
- `GET /api/v1/health/ready` проверяет Redis, если задан `REDIS_URL`, и
  возвращает 503 при недоступности.

## 12. Мобильное приложение (`apps/mobile`)

Нужен Flutter SDK; в репозиторий он не входит (весит ~2.5 ГБ). Проект проверен на
Flutter 3.47.7 / Dart 3.13.5 — эта же версия зафиксирована в CI.

### Установка на Windows

```powershell
# версия из CI — та же, чтобы локальные проверки совпадали с серверными
Invoke-WebRequest -Uri `
  "https://storage.googleapis.com/flutter_infra_release/releases/stable/windows/flutter_windows_3.47.7-stable.zip" `
  -OutFile "$env:TEMP\flutter.zip"
Expand-Archive "$env:TEMP\flutter.zip" -DestinationPath .tools
```

`flutter doctor` покажет, чего не хватает. Для `analyze`, `test` и `build web`
достаточно самого SDK; для APK нужен Android SDK, для iOS — macOS.

### Если среда запрещает запись вне проекта

Flutter по умолчанию пишет в `%LOCALAPPDATA%`, `%APPDATA%` и `%TEMP%`. Если эти
каталоги недоступны, перенаправьте их внутрь проекта — иначе первый запуск
падает с `Unable to 'pub upgrade' flutter tool`:

```powershell
$env:PUB_CACHE = "$PWD\.tools\pub-cache"
$env:HOME = "$PWD\.tools\home"
$env:TEMP = "$PWD\.tools\tmp"
$env:TMP = "$PWD\.tools\tmp"
$env:APPDATA = "$PWD\.tools\appdata"
$env:LOCALAPPDATA = "$PWD\.tools\localappdata"
```

### Проверки

```powershell
cd apps/mobile
flutter pub get
flutter analyze
flutter test
flutter build web --release   # проверка компиляции без Android SDK
```

### Сборка APK

Нужны JDK 17 и Android SDK; в репозиторий они не входят.

**JDK 17** (Temurin):

```powershell
Invoke-WebRequest -Uri `
  'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse' `
  -OutFile .tools\downloads\jdk17.zip
Expand-Archive .tools\downloads\jdk17.zip -DestinationPath .tools\jdk-temp
Move-Item (Get-ChildItem .tools\jdk-temp -Directory)[0].FullName .tools\jdk
```

**Android command-line tools**:

```powershell
Invoke-WebRequest -Uri `
  'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' `
  -OutFile .tools\downloads\cmdline-tools.zip
Expand-Archive .tools\downloads\cmdline-tools.zip -DestinationPath .tools\android-sdk
```

Архив распаковывается в `cmdline-tools/bin`, а `sdkmanager` ожидает
`cmdline-tools/latest/bin`: содержимое нужно переместить в `latest`.

**Переменные окружения.** Без `ANDROID_USER_HOME` sdkmanager пытается писать кэш в
`%USERPROFILE%\.android` и падает с `NoSuchFileException`, а список пакетов
остается пустым — `Failed to download any source lists`. Поэтому:

```powershell
$env:JAVA_HOME = "$PWD\.tools\jdk"
$env:ANDROID_SDK_ROOT = "$PWD\.tools\android-sdk"
$env:ANDROID_HOME = "$PWD\.tools\android-sdk"
$env:ANDROID_USER_HOME = "$PWD\.tools\android-home"
$env:GRADLE_USER_HOME = "$PWD\.tools\gradle-home"
```

**Пакеты SDK:**

```powershell
$sdkmanager = ".tools\android-sdk\cmdline-tools\latest\bin\sdkmanager.bat"
("y`n" * 80) | & $sdkmanager --sdk_root="$env:ANDROID_SDK_ROOT" --licenses
& $sdkmanager --sdk_root="$env:ANDROID_SDK_ROOT" `
  "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

Лицензии принимаются в `ANDROID_USER_HOME`: если принять их без этой переменной,
установка пакетов пройдет с сообщением «licenses were not accepted».

**Сборка:**

```powershell
cd apps/mobile
flutter config --android-sdk "$env:ANDROID_SDK_ROOT"
flutter config --jdk-dir "$env:JAVA_HOME"
flutter build apk --release
```

APK лежит в `build/app/outputs/flutter-apk/app-release.apk`. Первая сборка долгая
(скачивается Gradle и зависимости, ~30 минут); последующие — несколько минут.

**Адрес API в APK.** По умолчанию приложение обращается к `10.0.2.2:3000` — это
адрес хост-машины из эмулятора Android. На реальном телефоне он не работает: там
`10.0.2.2` — не ваша машина. Для устройства сборка делается с адресом в локальной
сети:

```powershell
flutter build apk --release `
  --dart-define=API_BASE_URL=http://192.168.54.45:3000/api/v1
```

Телефон должен быть в той же Wi-Fi сети, а API — запущен и не заблокирован
брандмауэром Windows (для порта 3000 нужно разрешение на входящие подключения).

**Сеть в манифесте.** В шаблоне Flutter разрешение `INTERNET` есть только в
debug-манифесте: release-сборка без него не обратится к API. Оно добавлено в
`android/app/src/main/AndroidManifest.xml` вместе с `usesCleartextTraffic`
(локальный API работает по http, а Android 9+ блокирует такие запросы). Для
production `usesCleartextTraffic` нужно убрать и перейти на https.

**Подпись.** Без настроенного keystore release-APK подписывается debug-ключом
(`CN=Android Debug`): на телефон установить можно, в Google Play — нельзя. Для
публикации нужен свой keystore и `android/key.properties` (в git не коммитится).

**Размер.** 49 МБ — потому что в APK все архитектуры. Три отдельных файла
(`--split-per-abi`) весят примерно по 17 МБ.

Скриншоты экранов для проверки дизайна (эталоны в `test/goldens`, только Windows):

```powershell
flutter test --update-goldens test/golden_screens_test.dart
```

### Демонстрационные данные

Чтобы экраны показывали реальные данные, а не пустые состояния:

```powershell
node scripts/demo-data.mjs
```

Скрипт создает филиал с залом, тренера, две группы с пятью учениками, расписание
на неделю, отметки посещаемости, оплату месяца и три объявления. Требует
запущенного API и `SUPERADMIN_*` в `apps/api/.env` (раздел 4).

Каждый запуск добавляет новый набор, поэтому перед повторным наполнением база
очищается:

```powershell
node scripts/reset-demo.mjs   # бизнес-данные и все пользователи, кроме SUPERADMIN
node scripts/demo-data.mjs    # чистый демонстрационный набор
```

`reset-demo.mjs` выполняет `TRUNCATE ... CASCADE` через `psql` одной транзакцией и
сохраняет суперадминистратора и справочник прав: без первого некому войти, второй
не демонстрационный. Остальные пользователи удаляются — они создавались
проверками и после очистки бизнес-данных ссылаются в пустоту.

## 13. Новая машина: чек-лист

Что переносится через git и что нужно поставить заново.

**В репозитории (приходит с `git clone`):** весь код, миграции, контракты,
документация (ADR, беклог, дизайн, эти инструкции), скрипты проверок, CI.

**Не в репозитории (создается локально):**

| Что | Как восстановить |
|---|---|
| `.env` | `cp apps/api/.env.example apps/api/.env`, задать `SUPERADMIN_*` и секреты JWT |
| PostgreSQL | раздел 3 (Docker или portable) |
| Redis | раздел 3a |
| Схема и справочники | раздел 5: миграции + `pnpm db:seed` |
| `node_modules` | `pnpm install` (раздел 2) |
| Flutter SDK | раздел 12 |
| Демо-данные | `node scripts/demo-data.mjs` |

Порядок: клон → `pnpm install` → `.env` → PostgreSQL/Redis → миграции → `db:seed`
→ `pnpm --filter @octagon/api start:dev` → админка (`docs/27`, раздел 8) →
Flutter (раздел 12).

Состояние диалога с ассистентом **не переносится**: DSH хранит историю сессий
локально (`~/.dsh`). Поэтому все решения записаны в репозиторий — в ADR
(`docs/decisions`), беклог (`docs/19-backlog.md`) и комментарии в коде, а не
остаются только в переписке.
