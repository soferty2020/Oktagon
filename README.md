# OCTAGON Club System

[![CI](https://github.com/soferty2020/Oktagon/actions/workflows/ci.yml/badge.svg)](https://github.com/soferty2020/Oktagon/actions/workflows/ci.yml)

Единая система управления клубом карате OCTAGON: backend API, web-админка и
мобильное приложение. Документация в `docs/` — источник истины (см. `AGENTS.md`).

## Структура монорепо

Каталоги соответствуют `docs/13-architecture.md`:

| Путь | Стек | Состояние |
| --- | --- | --- |
| `apps/api` | NestJS + Prisma + PostgreSQL | скелет модулей, схема БД, health-check |
| `apps/admin` | Next.js | не создан |
| `apps/mobile` | Flutter | не создан |
| `packages/contracts` | TypeScript | доменные enum'ы, коды ошибок |
| `packages/config` | TypeScript | схемы конфигурации |

План реализации и открытые решения: `docs/26-implementation-foundation.md`.
Запуск на локальной машине: `docs/27-local-development.md`.

## Требования

- Node.js ≥ 22
- pnpm 10 (`corepack enable pnpm`)
- PostgreSQL 16 (локально либо через `docker compose up -d postgres redis`)
- Redis (нужен для rate limiting auth-эндпоинтов)

Подробности запуска, включая portable-сборки без Docker: `docs/27-local-development.md`.

## Быстрый старт

```bash
pnpm install

# окружение backend
cp apps/api/.env.example apps/api/.env
# замените JWT_* секреты (минимум 32 символа) и DATABASE_URL

pnpm db:generate   # генерация Prisma Client
pnpm db:migrate    # применение миграций
pnpm db:seed       # permissions, первый суперадмин, филиал-заглушка

pnpm --filter @octagon/api start:dev
```

API: `http://localhost:3000/api/v1`
Swagger: `http://localhost:3000/api/v1/docs`

### Health-check

| Endpoint | Назначение |
| --- | --- |
| `GET /api/v1/health` | liveness — процесс жив |
| `GET /api/v1/health/ready` | readiness — проверка PostgreSQL и Redis (503 при недоступности) |

### Аутентификация

| Endpoint | Назначение |
| --- | --- |
| `POST /api/v1/auth/login` | вход по email и паролю; отдает access- и refresh-токены и профиль |
| `POST /api/v1/auth/refresh` | обновление сессии с ротацией refresh-токена |
| `POST /api/v1/auth/logout` | отзыв refresh-токена |
| `GET /api/v1/me` | профиль и эффективные права (нужен `Authorization: Bearer <access>`) |
| `GET /api/v1/me/athletes` | спортсмены, связанные с аккаунтом |
| `POST /api/v1/users/invites` | пригласить пользователя (право `users.manage`); токен возвращается один раз |
| `GET /api/v1/users/invites` | действующие приглашения (право `users.manage`) |
| `POST /api/v1/auth/accept-invite` | принять приглашение: задать пароль и профиль |
| `GET /api/v1/users/{id}/permissions` | права пользователя: ролевые, выданные лично, итоговые |
| `POST /api/v1/users/{id}/permissions` | выдать индивидуальное право (право `permissions.manage`) |
| `DELETE /api/v1/users/{id}/permissions/{code}` | отозвать индивидуальное право |
| `GET/POST /api/v1/branches` | филиалы (права `branches.view` / `branches.manage`) |
| `GET/PATCH/DELETE /api/v1/branches/{id}` | филиал, изменение, архивирование |
| `GET/POST /api/v1/branches/{id}/halls` | залы филиала |
| `PATCH/DELETE /api/v1/halls/{id}` | изменение и архивирование зала |
| `GET/POST /api/v1/trainers` | тренеры; профиль может существовать без аккаунта |
| `GET/PATCH/DELETE /api/v1/trainers/{id}` | профиль тренера |
| `GET/POST /api/v1/athletes` | спортсмены: список ограничен scope, контакты — по праву |
| `GET/PATCH/DELETE /api/v1/athletes/{id}` | карточка спортсмена |
| `POST /api/v1/athletes/{id}/accounts` | связать аккаунт со спортсменом |
| `DELETE /api/v1/athletes/{id}/accounts/{userId}` | снять связь аккаунта |
| `GET/POST /api/v1/groups` | группы (список ограничен scope; права `groups.view` / `groups.edit`) |
| `GET /api/v1/groups/by-athlete/{athleteId}` | действующая группа спортсмена |
| `GET/PATCH/DELETE /api/v1/groups/{id}` | группа с филиалами, тренерами и составом |
| `POST/DELETE /api/v1/groups/{id}/branches[/{branchId}]` | привязка филиалов к группе |
| `POST/DELETE /api/v1/groups/{id}/trainers[/{trainerId}]` | назначение тренеров |
| `POST/DELETE /api/v1/groups/{id}/members[/{athleteId}]` | состав группы и завершение членства |

## Проверки

```bash
pnpm lint        # Biome
pnpm typecheck
pnpm openapi:validate   # контракт не отстал от реализованных маршрутов
pnpm format:check
pnpm test        # unit-тесты
pnpm test:e2e    # API e2e (нужна БД octagon_test)
pnpm build
```

Если среда запрещает вложенный запуск pnpm-скриптов, используйте
`scripts/verify.ps1` (Windows) или `scripts/ci-verify.sh` (Linux/macOS) — они
вызывают компилятор, тест-раннер и линтер напрямую и печатают сводку по шагам.

PR не мержится при failed lint/test/build (`docs/16-testing.md`). Пайплайн —
`.github/workflows/ci.yml`: на push и pull request поднимаются PostgreSQL и
Redis, затем выполняются lint, typecheck, unit-тесты, сборка и e2e.

## Правила работы

- один issue = один логически завершенный результат;
- ветки `feat/<issue>-short-name`, `fix/<issue>-short-name`, `docs/<issue>-short-name`;
- изменения схемы БД — только миграциями;
- бизнес-логика и scope MVP не меняются без ADR (`docs/decisions/`);
- секреты не попадают в git.
