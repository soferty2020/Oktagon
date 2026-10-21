# 16. Testing Strategy

## Backend
- unit tests for business rules;
- integration tests for DB modules;
- API e2e for critical flows.

## Mobile/Web
- component/widget tests;
- state-management tests;
- smoke e2e for critical flows.

## Critical scenarios
- multi-athlete account;
- permission boundaries;
- schedule exception;
- attendance edit;
- debt calculation;
- retroactive freeze;
- payment marking fully paid;
- chat membership access.

## CI
PR не должен merge при failed lint/test/build.

Пайплайн — `.github/workflows/ci.yml`, два job: `verify` (PostgreSQL, Redis,
миграции, линтер, типы, тесты, сборка, e2e) и `admin` (контракты, типы и сборка
админки). Второй отдельный, потому что Next не нужны БД и Redis, а раздельные job
быстрее показывают, что именно сломалось.

### Локально работает — в CI падает

Два дефекта конфигурации CI были найдены только первым прогоном на GitHub: шаг
подготовки тестовой базы вызывал `pnpm db:deploy:test`, которого не было в
корневом `package.json`, а job `verify` не собирал пакеты, поэтому typecheck API
не находил `@octagon/contracts`. Локальный аналог (`scripts/verify.ps1`) оба
дефекта скрывал: он применяет миграции другим скриптом и запускается поверх уже
собранных пакетов.

Отсюда правила, которые стоит соблюдать при правке CI:

- **любой `pnpm <script>` из workflow должен существовать в корневом
  `package.json`** — pnpm не ищет скрипты в дочерних пакетах автоматически;
- **все, что резолвит `@octagon/*`, требует собранного `dist`**: `typecheck`,
  тесты и сборка идут после `pnpm build:packages`. Пакеты отдают только `dist`
  (`main` и `types` в их `package.json`);
- **не полагаться на утилиты образа раннера** (`psql` и подобные): либо ставить
  их явным шагом, либо использовать то, что уже есть в контейнерах сервисов;
- перед пушем полезно прогнать `scripts/verify.ps1 -Step all`, но он не заменяет
  первый прогон на GitHub: расхождения окружений видны только там.
