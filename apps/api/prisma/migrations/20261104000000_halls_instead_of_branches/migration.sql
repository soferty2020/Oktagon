-- Залы вместо филиалов (#64, ADR-0016).
--
-- Филиал упраздняется: адрес и телефон переезжают в зал, группа привязывается к
-- залу, спортсмен получает основной зал. Данные переносятся, не теряются.

-- 1. Зал получает адрес и телефон из филиала.
ALTER TABLE "halls" ADD COLUMN "address" TEXT;
ALTER TABLE "halls" ADD COLUMN "phone" TEXT;

UPDATE "halls" h
SET "address" = b."address",
    "phone" = b."phone"
FROM "branches" b
WHERE b."id" = h."branch_id";

-- 2. Группа привязана к залу: основной филиал группы → его первый зал.
ALTER TABLE "groups" ADD COLUMN "hall_id" UUID;

UPDATE "groups" g
SET "hall_id" = sub."hall_id"
FROM (
    SELECT DISTINCT ON (gb."group_id")
           gb."group_id" AS group_id,
           h."id" AS hall_id
    FROM "group_branches" gb
    JOIN "halls" h ON h."branch_id" = gb."branch_id"
    ORDER BY gb."group_id", gb."is_primary" DESC, h."created_at" ASC
) sub
WHERE sub."group_id" = g."id";

-- 3. Спортсмен закреплён за залом своей активной группы.
ALTER TABLE "athletes" ADD COLUMN "hall_id" UUID;

UPDATE "athletes" a
SET "hall_id" = sub."hall_id"
FROM (
    SELECT DISTINCT ON (gm."athlete_id")
           gm."athlete_id" AS athlete_id,
           g."hall_id" AS hall_id
    FROM "group_memberships" gm
    JOIN "groups" g ON g."id" = gm."group_id"
    WHERE gm."state" = 'ACTIVE' AND g."hall_id" IS NOT NULL
    ORDER BY gm."athlete_id", gm."joined_at" DESC
) sub
WHERE sub."athlete_id" = a."id";

CREATE INDEX "athletes_hall_id_idx" ON "athletes"("hall_id");
CREATE INDEX "groups_hall_id_idx" ON "groups"("hall_id");

ALTER TABLE "groups" ADD CONSTRAINT "groups_hall_id_fkey"
    FOREIGN KEY ("hall_id") REFERENCES "halls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "athletes" ADD CONSTRAINT "athletes_hall_id_fkey"
    FOREIGN KEY ("hall_id") REFERENCES "halls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Занятие: зал остаётся, пустой заполняется залом группы.
UPDATE "training_sessions" ts
SET "hall_id" = g."hall_id"
FROM "groups" g
WHERE g."id" = ts."group_id" AND ts."hall_id" IS NULL AND g."hall_id" IS NOT NULL;

ALTER TABLE "training_sessions" DROP CONSTRAINT IF EXISTS "training_sessions_branch_id_fkey";
ALTER TABLE "training_sessions" DROP COLUMN IF EXISTS "branch_id";

-- 5. Филиалы больше не нужны.
ALTER TABLE "halls" DROP CONSTRAINT IF EXISTS "halls_branch_id_fkey";
DROP INDEX IF EXISTS "halls_branch_id_name_key";
DROP INDEX IF EXISTS "halls_branch_id_idx";
ALTER TABLE "halls" DROP COLUMN IF EXISTS "branch_id";

DROP TABLE IF EXISTS "group_branches";
DROP TABLE IF EXISTS "branches";

CREATE INDEX IF NOT EXISTS "halls_name_idx" ON "halls"("name");
