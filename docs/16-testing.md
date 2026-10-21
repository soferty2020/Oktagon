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

### Как читать лог упавшего прогона

Статусы шагов говорят, **что** упало, но не **почему**. Сборка Docker-образов
показала это наглядно: по статусам было видно только «Build API image: failure»,
и три попытки исправить по догадкам (devDependencies, openssl, версия pnpm) не
попадали в причину — ею оказался `pnpm prune --filter`, который не поддерживает
этот флаг.

Лог доступен через GitHub API, если есть токен в хранилище учётных данных:

```bash
# токен берется тем же helper, что использует git push
printf 'protocol=https\nhost=github.com\n\n' | git credential fill
```

Дальше — `GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs` с заголовком
`Authorization: Bearer <token>`. `job_id` берется из
`GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs`.

Без токена лог не отдается (403 даже для публичного репозитория). Если токена
нет, полезнее не гадать по статусам, а упростить подозрительный шаг до
минимального и посмотреть, изменилось ли поведение.
