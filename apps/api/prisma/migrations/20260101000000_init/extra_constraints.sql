-- =============================================================================
-- Ограничения, которые Prisma schema не выражает (docs/08-database.md):
--
--   1. у спортсмена допускается не более одной активной GroupMembership;
--   2. у спортсмена допускается только один открытый FreezePeriod.
--
-- Оба ограничения реализуются частичными уникальными индексами PostgreSQL.
--
-- ВАЖНО: этот блок включен в конец migration.sql. Prisma применяет только
-- migration.sql, поэтому отдельный файл-сосед не выполнялся бы штатными
-- средствами (prisma migrate deploy) и индексы не создались бы на staging и
-- production. Проверяйте, что блок остался на месте, при пересоздании миграции.
--
-- Копия для чтения: extra_constraints.sql рядом.
-- =============================================================================

-- 1. Одна активная запись членства на спортсмена.
CREATE UNIQUE INDEX "group_memberships_one_active_per_athlete"
  ON "group_memberships" ("athlete_id")
  WHERE "state" = 'ACTIVE';

-- 2. Один открытый период заморозки на спортсмена.
CREATE UNIQUE INDEX "freeze_periods_one_open_per_athlete"
  ON "freeze_periods" ("athlete_id")
  WHERE "ended_on" IS NULL;
