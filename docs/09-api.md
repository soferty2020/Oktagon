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
- /conversations (доступ по участию, не по правам: BR-012)
- /messages
- /analytics

## Реестр спортсменов: фильтры, сортировка, пагинация

`GET /athletes` расширен без ломающих изменений.

| Параметр | Значения | Назначение |
|---|---|---|
| `search` | строка до 100 | поиск по фамилии, имени, отчеству |
| `hallId` | uuid | фильтр по залу (через активное членство в группе) |
| `groupId` | uuid | фильтр по группе |
| `status` | `ACTIVE`, `FROZEN`, `ARCHIVED` | фильтр по статусу |
| `sortBy` | `lastName`, `birthDate`, `status` | сортировка на сервере |
| `sortOrder` | `asc`, `desc` | направление |
| `page` | целое ≥ 1 | номер страницы |
| `limit` | 1–100, по умолчанию 20 | размер страницы |

- С `page` ответ — `{ items, total, page, limit }`; без `page` — прежний массив
  (совместимость с мобильным приложением).
- Сортировка учитывает зону видимости тренера: пагинация считает те же строки, что и фильтр.
- Порядок статусов фиксирован доменом: `ACTIVE`, затем `FROZEN`, затем `ARCHIVED`.
- Пустые даты рождения всегда в конце, независимо от направления.
- Вторичный ключ — фамилия, имя, отчество, `id`: строки не переставляются между страницами
  при равных значениях.

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
