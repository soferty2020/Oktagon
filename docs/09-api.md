# 09. API Guidelines

## Style
REST JSON API, versioned prefix: `/api/v1`.

## Auth
- access token + refresh token;
- password hash Argon2id или bcrypt;
- server-side permission checks mandatory.

## Основные ресурсы
- /auth
- /users
- /athletes
- /branches
- /groups
- /schedule-templates
- /training-sessions
- /attendance
- /membership-periods
- /payments
- /freezes
- /news
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
