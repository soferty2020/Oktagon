# 23. OpenAPI Contract Plan

OpenAPI 3.x хранится в репозитории как контракт. До реализации каждого модуля backend и clients согласуют schemas/endpoints.

## MVP endpoint groups
- POST /api/v1/auth/login
- POST /api/v1/auth/refresh
- POST /api/v1/auth/accept-invite
- GET /api/v1/me
- CRUD /api/v1/users
- CRUD /api/v1/athletes
- CRUD /api/v1/branches
- CRUD /api/v1/groups
- CRUD /api/v1/schedule-templates
- GET/PATCH /api/v1/training-sessions
- GET/PUT /api/v1/training-sessions/{id}/attendance
- POST /api/v1/training-sessions/{id}/planned-absence
- GET/PUT /api/v1/athletes/{id}/membership-periods/{year}/{month}
- POST /api/v1/membership-periods/{id}/payments
- POST/PATCH /api/v1/athletes/{id}/freezes
- CRUD /api/v1/news
- CRUD /api/v1/news/{id}/comments
- GET/POST /api/v1/conversations
- GET/POST /api/v1/conversations/{id}/messages
- GET /api/v1/analytics/dashboard

## Contract rules
- UUID identifiers.
- ISO-8601 timestamps; UTC transport.
- pagination on collections.
- stable machine error codes.
- authorization errors distinguish 401/403.
- idempotency considered for payment mutations.
- DTOs must not expose financial fields to unauthorized roles.
