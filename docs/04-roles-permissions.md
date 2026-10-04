# 04. Roles and Permissions

## Базовые роли
- MEMBER — родитель или взрослый спортсмен;
- STAFF — тренер/администратор;
- SUPERADMIN — руководитель.

## Permission model
Роли задают базовый набор прав, поверх которого доступны индивидуальные permissions.

Рекомендуемые permissions:
- athletes.view
- athletes.edit
- athletes.contacts.view
- groups.view
- groups.edit
- attendance.view
- attendance.edit
- schedule.view
- schedule.edit
- schedule.cancel
- schedule.change_trainer
- schedule.change_location
- payments.view
- payments.edit
- freezes.view
- freezes.edit
- news.create
- news.edit
- news.delete
- news.moderate
- chat.use
- branches.view
- branches.manage
- users.manage
- permissions.manage
- analytics.view

## Scope
STAFF по умолчанию ограничен своими группами. Более широкий scope назначается отдельно.
