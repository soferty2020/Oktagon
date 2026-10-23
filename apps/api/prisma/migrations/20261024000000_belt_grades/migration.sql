-- Пояса клуба (K3, BR-015).
--
-- Набор фиксирован и задан кодом (packages/contracts/src/belt-grades.ts):
-- таблица-справочник не нужна, CRUD через админку запрещён. Enum ограничивает
-- допустимые значения, порядок ступеней задается контрактом.

CREATE TYPE "BeltGrade" AS ENUM (
    'WHITE',
    'ORANGE',
    'ORANGE_BLUE_STRIPE',
    'BLUE',
    'BLUE_YELLOW_STRIPE',
    'YELLOW',
    'YELLOW_GREEN_STRIPE',
    'GREEN',
    'GREEN_BROWN_STRIPE',
    'BROWN',
    'BROWN_GOLD_STRIPE',
    'BLACK'
);

-- Оба поля nullable: у существующих спортсменов пояса нет, и миграция не должна
-- придумывать им значение. NULL означает «не присвоен», а не «белый пояс».
ALTER TABLE "athletes"
    ADD COLUMN "belt_grade" "BeltGrade",
    ADD COLUMN "belt_awarded_at" DATE;
