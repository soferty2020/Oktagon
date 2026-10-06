# 19. Backlog

## Статус выполнения

Отметки актуальны на коммит `74c0ba8` (возвраты денег, ADR-0010). Ниже по файлу
— исходный план без отметок, он остается источником состава работ.

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
| F8 Finance dashboard | **API и экраны готовы**, сводки по филиалам и динамики по месяцам нет: `packages/contracts` не описывает выручку за период, поэтому в админке сводка считается по должникам текущего месяца |

**Эпик G — Communication: не начат**

**Эпик H — Mobile: не начат** (каркас `apps/mobile` не создан)

**Эпик I — Admin Web: частично**

Сделано: I2 спортсмены, I3 группы, I5 филиалы, I6 расписание, экран посещаемости
занятия, список пользователей и права, **I8 экраны финансов** (сводка месяца,
должники, расчетные периоды и оплаты, заморозки).

Не сделано: I1 dashboard (финансовая сводка месяца в обзоре есть, выручки по
филиалам и динамики нет — см. F8), I4 экраны тренеров, I7 филиалы и залы
полностью, форма «занятие вручную» (backfill), экран приглашений.
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
