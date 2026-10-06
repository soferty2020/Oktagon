# 19. Backlog

## Статус выполнения

Отметки актуальны на коммит `3a9dd45` (новости и комментарии, G1–G2). Ниже по
файлу — исходный план без отметок, он остается источником состава работ.

**Эпик A — Foundation: выполнено**
A1, A2, A3 (CI), A4, A5, A6.

**Эпик B — Identity: выполнено**
B1–B6.

**Эпик C — Club structure: выполнено**
C1–C8.

**Эпик D — Schedule: выполнено**
D1–D4.

**Эпик E — Attendance: сделано E1–E2**

- E1 отметки посещаемости, E2 экран журнала занятия — сделано;
- E3 изменение задним числом — сделано (отметку можно поставить на прошедшее
  занятие);
- E4 сводка посещаемости — **backend готов** (`GET /attendance/summary`), экрана
  в админке нет.

**Эпик F — Finance: выполнено полностью (F1–F8)**

Важно: буквы F1–F8 в этом списке — из плана, а не из истории коммитов. Коммиты
названы независимо (`F1`…`F4` в сообщениях — это порядок моей работы), поэтому
опираться нужно на этот раздел.

| Пункт | Состояние |
| --- | --- |
| F1 MembershipPeriod | сделано: `GET/PATCH /membership-periods`, период заводится при обращении |
| F2 Payment transaction | сделано: `POST .../payments`, идемпотентность, изменение, отмена |
| F3 Mark fully paid | сделано: `POST .../fully-paid` (BR-003) |
| F4 Debt calculation | сделано: `GET /debts` (BR-004), проверено вживую |
| F5 Refund record | сделано: `POST .../refunds` и `DELETE /refunds/{id}` (ADR-0010). Возврат — отдельное движение средств: зачтено = поступления − возвраты, поступление остается в истории |
| F6 Freeze period | сделано: `POST /athletes/{id}/freezes`, `POST /freezes/{id}/close` |
| F7 Retroactive freeze | сделано: начало и завершение принимаются задним числом (BR-005) |
| F8 Finance dashboard | сделано: `GET /finance/summary` — выручка (по датам движений), задолженность (по расчетному месяцу), должники и разбивка по филиалам; экраны `/finance` и обзор. Осталась динамика по месяцам — отдельный вопрос, см. `docs/26` |

**Эпик G — Communication: выполнено (G1–G6)**

Сделано: G1 новости (создание, черновик, публикация, архив, поиск), G2
комментарии, G3 модель диалога, G4 личные диалоги, G5 групповые чаты, G6
прочитанность. Доступ — по участию, а не по правам (матрица прав: «own
conversations»); решения по жизненному циклу диалога и составу участников — в
ADR-0011 и ADR-0012.

Не сделано осознанно: вложения, реакции, голосовые и правка сообщений
(docs/01-mvp-scope.md), модерация чужих сообщений (нет права в каталоге).

**Эпик H — Mobile: не начат** (каркас `apps/mobile` не создан)

**Эпик I — Admin Web: частично**

Сделано: I1 dashboard (обзор показывает выручку месяца, должников и недостачу из
сводки; динамика по месяцам — открытый вопрос), I2 спортсмены, I3 группы,
I5 филиалы, I6 расписание, экран посещаемости занятия, список пользователей и
права, **I8 экраны финансов** (сводка месяца со сравнением филиалов, должники,
расчетные периоды и оплаты, заморозки), экран приглашений (создание, список и
передача ссылки вручную).

Не сделано: I4 экраны тренеров, I7 филиалы и залы полностью, форма «занятие
вручную» (backfill).
I9 закрыт экраном `/finance/freezes` и разделом заморозок в карточке
спортсмена.

---

## План без отметок

## EPIC A — Foundation
- A1 Bootstrap monorepo
- A2 Docker local environment
- A3 CI pipeline
- A4 Shared config and env validation
- A5 Base logging/error format
- A6 Audit infrastructure

## EPIC B — Identity
- B1 User model
- B2 Email/password auth
- B3 Invite flow
- B4 Refresh tokens
- B5 RBAC + permissions
- B6 Resource scope checks

## EPIC C — Club structure
- C1 Branch CRUD
- C2 Hall abstraction
- C3 Trainer profiles
- C4 Athlete CRUD
- C5 Account-athlete linking
- C6 Group CRUD
- C7 Group trainers
- C8 Group membership

## EPIC D — Scheduling
- D1 Schedule template
- D2 Quarterly generation
- D3 Training sessions
- D4 Session exception editing
- D5 Holidays/breaks
- D6 Schedule queries for member/staff

## EPIC E — Attendance
- E1 Planned absence
- E2 Attendance sheet
- E3 Historical edit
- E4 Attendance statistics

## EPIC F — Finance
- F1 MembershipPeriod
- F2 Payment transaction
- F3 Mark fully paid
- F4 Debt calculation
- F5 Refund record
- F6 Freeze period
- F7 Retroactive freeze
- F8 Finance dashboard

## EPIC G — Communication
- G1 News CRUD
- G2 News comments
- G3 Conversation model
- G4 Direct chats
- G5 Group chats
- G6 Message read state

## EPIC H — Mobile
- H1 Auth
- H2 Athlete switcher
- H3 Member home
- H4 Schedule
- H5 Attendance
- H6 Planned absence
- H7 News
- H8 Chat
- H9 Profile
- H10 Trainer today/groups/attendance

## EPIC I — Admin Web
- I1 Dashboard
- I2 Athletes
- I3 Groups
- I4 Trainers
- I5 Branches
- I6 Schedule calendar
- I7 Attendance
- I8 Finance
- I9 Freeze management
- I10 Users/permissions
- I11 News

## EPIC J — Release
- J1 Staging
- J2 Backup/restore test
- J3 Security review
- J4 E2E regression
- J5 Production deployment
