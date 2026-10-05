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
.tools/pgsql/bin/initdb -D .tools/pgdata -U octagon -A trust -E UTF8 --no-locale

# запуск сервера на 5432 с timezone UTC
node scripts/pg-start.mjs

# базы
.tools/pgsql/bin/psql -h 127.0.0.1 -U octagon -d postgres \
  -c 'CREATE DATABASE octagon OWNER octagon' \
  -c 'CREATE DATABASE octagon_test OWNER octagon'
```

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
