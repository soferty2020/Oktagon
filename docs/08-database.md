# 08. Database Design

## PostgreSQL
Все primary keys рекомендуется хранить как UUID.

## Ключевые ограничения
- email пользователя уникален;
- спортсмен одновременно имеет не более одной активной GroupMembership;
- MembershipPeriod уникален по athlete_id + year + month;
- Attendance уникален по training_session_id + athlete_id;
- FreezePeriod допускает один открытый период на спортсмена;
- удаление бизнес-данных предпочтительно soft-delete/archive.

## Время
- timestamps хранить в UTC;
- локальную timezone клуба хранить в конфигурации;
- календарные расчетные периоды хранить отдельными year/month, а не выводить из UTC timestamps.

## AuditLog
Минимальные поля:
- actor_user_id
- action
- entity_type
- entity_id
- before_json
- after_json
- created_at

Полная ERD должна быть добавлена отдельной задачей до реализации модулей schedule/payments.
