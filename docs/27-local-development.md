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
описывать. Они лежат в
`apps/api/prisma/migrations/20260101000000_init/extra_constraints.sql` и должны
включаться в миграцию при ее применении:

1. не более одной активной `GroupMembership` на спортсмена;
2. не более одного открытого `FreezePeriod` на спортсмена.

## 6. Запуск API

```bash
pnpm --filter @octagon/api start:dev   # watch-режим
pnpm --filter @octagon/api build && pnpm --filter @octagon/api start:prod
```

- API: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/api/v1/docs`
- OpenAPI JSON: `http://localhost:3000/api/v1/openapi.json`

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
pnpm test:e2e    # e2e (нужна БД octagon_test)
pnpm lint        # Biome
```

В средах, где вложенный `pnpm <script>` не может запустить дочерний процесс,
используйте `scripts/verify.ps1` — он вызывает компилятор и раннеры напрямую:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify.ps1
```

## 8. Линтер и форматтер

- **Biome** (`biome.json`) — линтер. Выбран вместо ESLint: ESLint 9.39 в
  pnpm-раскладке конфликтует с `ajv` (`Cannot set properties of undefined
  (setting 'defaultMeta')`). Biome не требует плагинов и не зависит от ajv.
- **Prettier** (`.prettierrc.json`) — форматирование, отдельной командой
  `pnpm format`.

## 9. Redis

Для MVP Redis не обязателен: `REDIS_URL` опционален. Он понадобится для
rate limiting и очередей; до этого момента переменную можно не задавать.
