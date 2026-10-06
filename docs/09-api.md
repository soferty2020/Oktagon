# 09. API Guidelines

## Style
REST JSON API, versioned prefix: `/api/v1`.

## Auth
- access token + refresh token;
- password hash Argon2id или bcrypt;
- server-side permission checks mandatory.

## Основные ресурсы
- /auth (в том числе публичный просмотр приглашения по токену)
- /users (в том числе приглашения)
- /athletes
- /branches
- /groups
- /schedule-templates
- /training-sessions
- /attendance
- /membership-periods
- /payments
- /refunds
- /finance (сводка за месяц)
- /freezes
- /news (чтение без прав: BR-011)
- /news-comments
- /conversations
- /messages
- /analytics

## Contract
OpenAPI является машинно-читаемым контрактом между backend, mobile и web.

## Ошибки
Единый формат:
```json
{
  "code": "SCHEDULE_CONFLICT",
  "message": "Human-readable message",
  "details": {}
}
```
