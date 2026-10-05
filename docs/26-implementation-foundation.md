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
- `RedisModule` — клиент Redis (rate limiting auth, кэш/очереди); readiness
  проверяет Redis, если задан `REDIS_URL`;
- `HealthModule` — `GET /api/v1/health` (liveness) и `GET /api/v1/health/ready` (readiness).

Реализовано (issue A6 — инфраструктура аудита):

- `AuditModule` — глобальный модуль аудита по BR-007;
- `AuditService.record(event, tx?)` — запись события, в том числе внутри
  транзакции вызывающего модуля, чтобы аудит не расходился с данными;
- `AuditService.recordSafely` — запись, сбой которой не отменяет основное
  действие (например, фиксация неудачной попытки входа);
- `AuditService.list` — история изменений сущности для карточки в админке;
- `RequestContextService` (AsyncLocalStorage) + `AuditContextInterceptor` —
  автоподстановка `requestId`, IP и user-agent;
- словарь `AuditAction` и `AuditEntityType` в `packages/contracts` — общий
  контракт backend и админки.

Реализовано (issue B1 — слой identity):

- `IdentityRepository` (абстрактный класс как DI-токен) + `PrismaIdentityRepository`
  — доступ к `User`, `UserPermission`, `UserAthlete`, `GroupMembership`;
- `IdentityService` — профиль, связанные спортсмены, проверка ресурсного scope
  (`canAccessAthlete`);
- `GET /api/v1/me` — профиль и эффективные права; `GET /api/v1/me/athletes` —
  связанные спортсмены (ADR-0007);
- `resolvePermissions` и `canAccessAthlete` — чистые функции в
  `packages/contracts/src/identity.ts`, общие для backend и тестов;
- `StubAuthGuard` — временная заглушка аутентификации, включается только
  `LOCAL_AUTH_STUB=true`; без нее защищенные маршруты отвечают 401. Удаляется в B2.

Остальные модули — заготовки с указанием спецификации. Реализация ведется
отдельными issue по merge order из `docs/24-multi-agent-plan.md`.

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

## Архитектурные решения

Зафиксированы ADR:

- `docs/decisions/ADR-0004-password-hashing.md` — Argon2id с PHC-форматом.
  Реализуется в B2; временный scrypt в seed подлежит замене.
- `docs/decisions/ADR-0005-orm-prisma.md` — Prisma как ORM и миграции, явный
  `output` клиента, частичные индексы рядом с миграцией, `GroupBranch`.
  Отклонение от ERD v1: связь группы с филиалом через `GroupBranch`, а не
  `branchId`. Кандидат на обновление `docs/22-erd.md`.
- `docs/decisions/ADR-0006-permissions-model.md` — модель прав: базовый набор
  роли в коде (MEMBER без permissions, доступ по scope), каталог и
  индивидуальные выдачи в БД, scope отдельным измерением, финансы через
  `isFinancial`.
- `docs/decisions/ADR-0007-identity-profile-contract.md` — форма `GET /me`:
  профиль без связанных спортсменов, права как `codes` + `grants`, scope явным
  полем, чистые функции вычисления прав и проверки доступа к спортсмену.

Открытые вопросы для ADR: нет.

Осознанно не оформляется ADR: выбор Biome вместо ESLint (инструмент, не
архитектура; причина описана в `docs/27-local-development.md`).

## Проверено локально

- `pnpm build`, `pnpm typecheck`, unit- и e2e-тесты, `pnpm lint` — проходят
  (unit: 14 тестов, e2e без БД: 4, e2e на БД: 2);
- миграция применена к PostgreSQL 16.6 в `octagon` и `octagon_test`: по 28 таблиц,
  13 enum-типов и оба частичных уникальных индекса;
- `pnpm db:seed` создает 26 permissions, суперадмина (пароль хранится как
  scrypt-хеш) и филиал-заглушку с одним залом;
- запущенный API отвечает: `GET /api/v1/health` -> 200, `GET /api/v1/health/ready`
  -> 200 `{"checks":[{"name":"database","status":"up"}]}`,
  `GET /api/v1/openapi.json` -> описание с путями health;
- неизвестный маршрут отдает единый формат ошибки
  `{"code":"NOT_FOUND","message":"...","details":{}}`;
- заголовок `x-request-id` проставляется и возвращается клиенту;
- аудит: запись сохраняется в БД с JSON-снимками, `requestId`, IP и user-agent
  (проверено e2e на реальной БД);
- `GET /api/v1/me` на реальных данных seed: 200, роль `SUPERADMIN`, 26 прав,
  поля `passwordHash` и `athletes` в ответе отсутствуют (ADR-0007);
- `GET /api/v1/me` без заголовка `x-user-id` или при выключенной заглушке —
  401 `UNAUTHENTICATED`;
- readiness с живыми PostgreSQL и Redis: 200, проверки `database` и `redis`;
- при остановленном Redis readiness отдает 503 `SERVICE_UNAVAILABLE` с
  `checks: [{database: up}, {redis: down}]`.

Проверок всего: unit — 38 (11 contracts + 27 api), e2e — 7 без БД и 2 на БД.

Подробности запуска и обхода ограничений среды — `docs/27-local-development.md`.

## Следующие шаги

1. **B2** — email/password auth: `POST /auth/login`, `POST /auth/refresh`,
   `GET /me`, Argon2id (ADR-0004), ротация refresh-токенов, rate limiting
   (`docs/15-security.md`). Удалить `StubAuthGuard`.
2. **B3** — invite flow: `POST /auth/accept-invite` и приглашение администратором.
3. **B5/B6** — guards для RBAC, permissions и resource scope поверх
   `IdentityService` (`docs/21-permission-matrix.md`).
4. `apps/admin` — каркас Next.js + генерация клиента из `openapi.yaml`.
5. `apps/mobile` — каркас Flutter (требует установленного Flutter SDK).
6. **A3** — CI pipeline: typecheck, lint, тесты, сборка.
7. Обновить `docs/22-erd.md` под `GroupBranch` (см. ADR-0005).

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
