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

Реализовано (issue B2 — аутентификация):

- `PasswordService` — Argon2id в PHC-формате (`@node-rs/argon2`, ADR-0004);
  хеш чужого формата считается несовпадением, а не ошибкой сервера;
- `TokenService` + `AccessTokenVerifier` + `AuthGuard` — access-токены (JWT,
  HS256) и защита маршрутов через `Authorization: Bearer`;
- `RefreshTokenService` — refresh-токены с ротацией: в БД хранится только
  SHA-256-хеш; повторное использование отозванного токена отзывает все токены
  пользователя;
- `RateLimiterService` — фиксированное окно на Redis (`INCR` + `EXPIRE`),
  лимиты по IP и по email отдельно;
- `AuthService` и эндпоинты `POST /auth/login`, `POST /auth/refresh`,
  `POST /auth/logout`;
- `TokenModule` — глобальный модуль проверки токенов: guard нужен всем
  доменным модулям, а зависимость от модуля auth создала бы цикл
  auth -> identity -> auth;
- `prisma/seed.ts` переведен на Argon2id: иначе созданный seed-ом суперадмин не
  смог бы войти.

Реализовано (issue B3 — приглашения):

- `InviteService` и `InviteRepository`: приглашение создается администратором с
  правом `users.manage`; в БД хранится только SHA-256-хеш токена, сам токен
  возвращается один раз при создании (провайдер доставки письма не выбран,
  docs/25-open-questions.md);
- перевыпуск гасит предыдущие неиспользованные приглашения;
- гашение приглашения атомарно (`consume`): при одновременных запросах успевает
  только один, второй получает `INVITE_ALREADY_USED`;
- проверки при принятии: срок действия, совпадение email, признак
  использования; роль берется из приглашения, а не из запроса;
- `PermissionsGuard` + `@RequirePermissions` — проверка прав на маршруте.
  Права вычисляются на каждом запросе через IdentityService (ADR-0006), поэтому
  отзыв права действует сразу; неаутентифицированный запрос получает 401, а не
  403;
- эндпоинты `POST /users/invites`, `GET /users/invites`,
  `POST /auth/accept-invite` (с лимитом попыток по IP: токен — секрет).

Реализовано (issues B5/B6 — индивидуальные права и ресурсный scope):

- `PermissionGrantService` — выдача и отзыв индивидуальных прав;
  `GET/POST /users/{id}/permissions`, `DELETE /users/{id}/permissions/{code}`
  под правом `permissions.manage`;
- истекшая выдача не действует: фильтр «бессрочная или с непрошедшим сроком»
  применяется при каждом чтении, иначе временный доступ остался бы навсегда;
- право, которое уже обеспечивает роль, нельзя ни выдать, ни отозвать
  (`PERMISSION_GRANTED_BY_ROLE` / `PERMISSION_IS_ROLE_BASED`): роль остается
  предсказуемой, а выдача не создает иллюзию управляемого доступа;
- изменения прав пишутся в audit log (BR-007), финансовые выдачи
  дополнительно отмечаются в логах (BR-010);
- `ResourceScopeService` — вторая половина правила из
  `docs/21-permission-matrix.md`: наличие permission не дает доступа к чужой
  группе или спортсмену. Методы `checkAthlete`, `checkGroup`,
  `assertAthleteAccess`, `assertGroupAccess`, `visibleGroupIds`;
- `canAccessAthlete` и `canAccessGroup` возвращают решение с причиной
  (`ScopeDecision`), а не boolean: причину видно в логах и проверяют тесты;
- модуль identity экспортирует `ResourceScopeService`: доменные модули обязаны
  проверять scope отдельно от прав.

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
включены в конец `migration.sql` (Prisma применяет только этот файл, поэтому
отдельный файл-сосед не сработал бы):

1. один открытый `FreezePeriod` на спортсмена;
2. не более одной активной `GroupMembership` на спортсмена.

## Непрерывная интеграция (A3)

`.github/workflows/ci.yml` на push и pull request: сервисы `postgres:16-alpine`
и `redis:7-alpine`, затем установка зависимостей, генерация Prisma Client,
миграция тестовой базы, lint, typecheck, unit-тесты, сборка и e2e.

Те же шаги на Linux/macOS выполняет `scripts/ci-verify.sh`; на Windows —
`scripts/verify.ps1`.

Проверено локально: миграции применяются к пустой базе, после чего e2e-тесты
проходят на этой базе. Штатный `prisma migrate deploy` (как в CI) в этой
рабочей среде недоступен — schema-engine запускается песочницей и падает с
`spawn EPERM`, поэтому SQL применялся через `scripts/apply-migration.mjs`;
схема при этом идентична.

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
  Argon2id-хеш, ADR-0004) и филиал-заглушку с одним залом;
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
  `checks: [{database: up}, {redis: down}]`;
- вход вживую на данных seed: `POST /auth/login` -> 200 с access- и
  refresh-токенами и профилем (26 прав, `passwordHash` не раскрыт);
- ротация: `POST /auth/refresh` -> 200 и новая пара токенов; повтор старого
  токена -> 401, после чего все токены пользователя отозваны (следующий
  refresh тоже 401);
- `POST /auth/logout` -> 204, после него refresh отдает 401;
- rate limiting вживую: 9-я и последующие попытки входа -> 429 `RATE_LIMITED`
  (в окне расходуются квоты и по IP, и по email, поэтому порог наступает
  раньше номинальных 10 — это ожидаемое поведение двойного лимита);
- приглашения вживую: создание -> 201 с токеном; список отдает приглашение без
  хеша токена; принятие -> 200 и вход новым пользователем (STAFF, 7 прав
  роли); повторное принятие -> 409 `INVITE_ALREADY_USED`; STAFF без
  `users.manage` при попытке пригласить получает 403 `FORBIDDEN` со списком
  недостающих прав; неизвестный токен -> 400 `INVITE_INVALID`;
- права и scope на реальной БД: выдача права включает его в эффективный набор;
  истекшая выдача (срок сдвинут в прошлое) перестает действовать; право роли
  нельзя выдать (`PERMISSION_GRANTED_BY_ROLE`) и нельзя отозвать
  (`PERMISSION_IS_ROLE_BASED`); тренер видит только свои группы, чужая группа
  дает `denied_out_of_scope` и 403; суперадмин видит все.

Проверок всего: unit — 106 (11 contracts + 95 api), e2e — 36 без БД и 22 на БД.

Подробности запуска и обхода ограничений среды — `docs/27-local-development.md`.

## Следующие шаги

1. **C1..C8** — эпик Club structure: филиалы, залы, тренеры, спортсмены, группы.
   Это первый эпик, который использует `ResourceScopeService` для фильтрации
   списков, а не только проверок.
2. `apps/admin` — каркас Next.js + генерация клиента из `openapi.yaml`.
3. `apps/mobile` — каркас Flutter (требует установленного Flutter SDK).
4. Обновить `docs/22-erd.md` под `GroupBranch` (см. ADR-0005).
5. Наполнить `openapi.yaml` схемами auth/identity/invites/permissions (сейчас
   там только заготовка).
6. Доставка приглашений письмом — когда будет выбран провайдер
   (`docs/25-open-questions.md`). Контракт при этом не меняется.
7. Scope по филиалам: сейчас `User.scopeAllGroups` — булев флаг. Отдельная
   таблица scope потребует нового ADR (см. ADR-0006, раздел Consequences).

Закрыто: A3 (CI), B1, B2, B3, B5, B6.

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
