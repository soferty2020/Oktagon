# 15. Security

- HTTPS only in production;
- password hashing;
- short-lived access tokens;
- refresh token rotation recommended;
- backend RBAC + permissions + resource scope;
- rate limiting auth endpoints;
- audit log;
- no secrets in repository;
- least privilege for DB/storage credentials;
- financial endpoints separately protected;
- input validation on all API boundaries;
- file upload type/size validation when media is introduced.

Privacy:
контактные данные спортсменов/родителей доступны только сотрудникам с соответствующим правом.

## Состояние проверки

Security review проведен на коммите `6521694` (эпик J). Ниже — по каждому пункту,
чтобы при следующей проверке не начинать с нуля.

| Требование | Где реализовано | Проверка |
|---|---|---|
| HTTPS only in production | `SecurityHeadersMiddleware` (HSTS в production) | `security-headers.middleware.spec.ts` |
| Password hashing | Argon2id, параметры OWASP (`password.service.ts`, ADR-0004) | `password.service.spec.ts` |
| Short-lived access tokens | `JWT_ACCESS_TTL_SECONDS=900` | `token.service.spec.ts` |
| Refresh token rotation | ротация + отзыв всех токенов при повторном использовании | `auth.service.spec.ts` |
| RBAC + permissions + scope | `PermissionsGuard`, `ResourceScopeService` | `permissions.guard.spec.ts`, `identity.test.ts` |
| Rate limiting auth | вход (IP и email), приглашение, обновление сессии | `auth.service.spec.ts` |
| Audit log | `AuditService`, контекст запроса с автором | `audit-context.interceptor.spec.ts` |
| No secrets in repository | только `.env.example`; секреты не коммитятся | `git ls-files` |
| Input validation on boundaries | `ValidationPipe` c `whitelist` и `forbidNonWhitelisted` | e2e |
| Financial endpoints separately protected | `payments.view` / `payments.edit` (BR-010) | `check-acceptance.mjs` |
| Settings only for SUPERADMIN | `SuperadminGuard` по роли, grants не делегируют | `settings.db-e2e-spec.ts` (403 для STAFF и MEMBER) |
| Audit нельзя изменить | нет эндпоинтов изменения и удаления | `settings.db-e2e-spec.ts` (PATCH/DELETE → 404) |
| Персональные данные в журнале замаскированы | `redact` в `AuditService.listForView` | `settings.db-e2e-spec.ts` («•••» вместо телефона) |
| Справочник поясов неизменяем | только `GET /belt-grades` | `settings.db-e2e-spec.ts` (POST/DELETE → 404) |
| Секретов в ответах настроек нет | контракт `ClubProfileView` | `settings.db-e2e-spec.ts` (точный набор полей) |
| Загрузка фото проверяется | MIME и размер в `NewsImagesService`, лимит nginx | `news-images.service.spec.ts` |
| Согласие на обработку ПДн в заявке | `consent` обязателен в `CreateTrialRequestDto`; дата и редакция пишутся в заявку | `trial-requests.service.spec.ts` |
| Удаление ПДн | `POST /athletes/:id/erase` — обезличивание, история остаётся | `athletes.service.spec.ts` |
| Блокировка аккаунта | `PATCH /users/:id/status`, отзыв всех refresh-токенов | `identity.service.spec.ts` |
| Ретенция | `infra/scripts/octagon-retention.sh`: аудит 365 дней, финальные заявки 180 | cron 1-го числа |

**Найдено и исправлено при проверке:**

1. **CORS принимал любой источник вместе с cookie.** `origin: true` +
   `credentials: true` означало, что сторонний сайт может обращаться к API от
   имени вошедшего пользователя: браузер приложил бы httpOnly-cookie админки.
   Теперь источники берутся из `CORS_ORIGINS`, а в `staging` и `production`
   список обязателен — без него приложение не стартует. В `local` и `test`
   разрешен любой источник: админка ходит с разных портов и хостов.
2. **У `/auth/refresh` не было ограничения частоты.** Refresh-токен — секрет, и
   без лимита его можно перебирать; при совпадении отзывались бы токены
   владельца. Лимит добавлен, ключ отдельный от входа, чтобы обычная работа не
   выбивала пользователя из системы.
3. **Заголовков безопасности не было вовсе.** Добавлен
   `SecurityHeadersMiddleware`: `nosniff`, `X-Frame-Options: DENY`,
   `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-site` и
   HSTS в production. Реализация без внешней зависимости: набор для JSON-API
   фиксированный. При появлении отдачи HTML (например, вложений) стоит
   пересмотреть в пользу проверенной библиотеки.
4. **Лимиты читались из `process.env` напрямую.** Опечатка в переменной давала
   `NaN`, и защита молча снималась. Теперь значения берутся из валидированного
   конфига (`packages/config`), который проверяет их при старте.

**Осталось проверить (требует окружения):**

- `npm audit` по зависимостям: нужен доступ к реестру;
- HTTPS, сертификаты и reverse proxy: проверяются на staging;
- права учетной записи БД (least privilege): зависят от площадки;
- CSP и заголовки для страниц админки: отдельное приложение Next.js.

