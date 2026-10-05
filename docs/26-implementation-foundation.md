# 26. Implementation Foundation Plan

Статус: в работе. Основание: `docs/13-architecture.md` (monorepo, modular monolith),
`docs/24-multi-agent-plan.md` (contracts-first, merge order).

## Что уже создано

### Монорепо

| Путь | Назначение |
| --- | --- |
| `apps/api` | NestJS backend (modular monolith) |
| `packages/contracts` | доменные enum'ы, коды ошибок, транспортные примитивы |
| `packages/config` | схемы конфигурации и валидация переменных окружения |

`apps/admin` (Next.js) и `apps/mobile` (Flutter) из `docs/13-architecture.md`
еще не созданы — см. «Следующие шаги».

### Backend: модули

Создан скелет всех 13 модулей из `docs/13-architecture.md`:
auth, identity, athletes, club-structure, groups, scheduling, attendance,
finance, freezes, news, chat, analytics, audit.

Плюс инфраструктурные модули:

- `AppConfigModule` — валидация окружения на старте;
- `PrismaModule` — единственный экземпляр PrismaClient;
- `HealthModule` — `GET /api/v1/health` (liveness) и `GET /api/v1/health/ready` (readiness).

Бизнес-логика модулей не реализована: каждый модуль — заготовка с указанием
спецификации. Реализация ведется отдельными issue по merge order из
`docs/24-multi-agent-plan.md`.

### Данные

`apps/api/prisma/schema.prisma` покрывает все сущности из `docs/07-domain-model.md`
и `docs/22-erd.md` (26 сущностей) и ограничения из `docs/08-database.md`:

- UUID primary keys;
- `MembershipPeriod` уникален по `athlete_id + year + month`;
- `Attendance` уникален по `training_session_id + athlete_id`;
- календарные даты — `@db.Date`, транспортный UTC — `DateTime`;
- `AuditLog` с `actor_user_id`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json`;
- soft-delete/archive через `archived_at` / `deleted_at`.

Два ограничения Postgres выражаются только частичными уникальными индексами и
добавлены в миграцию вручную:

1. один открытый `FreezePeriod` на спортсмена;
2. не более одной активной `GroupMembership` на спортсмена.

## Решения, требующие фиксации ADR

1. **Prisma как ORM и миграционный инструмент.** `docs/08-database.md` требует
   миграций, но ORM не выбирает. Предлагается ADR-0004.
2. **Формат справочника ролей/permissions.** В MVP permissions хранятся как
   каталог в БД (`Permission`) + индивидуальные выдачи (`UserPermission`), а
   базовый набор роли задается кодом. Предлагается ADR-0005.
3. **Хранение пароля на этапе до модуля auth.** `prisma/seed.ts` пишет scrypt-хеш
   (`scrypt$<salt>$<hash>`); модуль auth должен закрепить Argon2id или bcrypt
   (`docs/09-api.md`) и мигрировать формат.
4. **Линтер: Biome вместо ESLint.** ESLint 9.39 в pnpm-раскладке не запускается
   из-за конфликта `@eslint/eslintrc` с `ajv`. Biome не требует плагинов.
   Предлагается ADR-0006.

## Проверено локально

- `pnpm build`, `pnpm typecheck`, unit- и e2e-тесты, `pnpm lint` — проходят;
- миграция применена к PostgreSQL 16.6, в базе 28 таблиц, 13 enum-типов и оба
  частичных уникальных индекса;
- `pnpm db:seed` создает 26 permissions, суперадмина (пароль хранится как
  scrypt-хеш) и филиал-заглушку с одним залом;
- запущенный API отвечает: `GET /api/v1/health` -> 200, `GET /api/v1/health/ready`
  -> 200 `{"checks":[{"name":"database","status":"up"}]}`,
  `GET /api/v1/openapi.json` -> описание с путями health;
- неизвестный маршрут отдает единый формат ошибки
  `{"code":"NOT_FOUND","message":"...","details":{}}`;
- заголовок `x-request-id` проставляется и возвращается клиенту.

Подробности запуска и обхода ограничений среды — `docs/27-local-development.md`.

## Следующие шаги

1. ADR по ORM, модели permissions, формату хеша пароля и выбору линтера.
2. `apps/admin` — каркас Next.js + генерация клиента из `openapi.yaml`.
3. `apps/mobile` — каркас Flutter (требует установленного Flutter SDK).
4. Реализация identity/auth: единственный workstream, который разблокирует
   остальные (`docs/24-multi-agent-plan.md`, merge order).
5. Наполнение `openapi.yaml` схемами по модулям до реализации клиентов.
6. Rate limiting для auth-эндпоинтов (Redis) — требуется `docs/15-security.md`.

## Команды

```bash
# зависимости
pnpm install

# генерация Prisma Client
pnpm db:generate

# применение миграций
pnpm db:migrate

# справочные данные и суперадмин
pnpm db:seed

# сборка, тесты, линтер
pnpm build
pnpm test
pnpm test:e2e
pnpm lint
```
