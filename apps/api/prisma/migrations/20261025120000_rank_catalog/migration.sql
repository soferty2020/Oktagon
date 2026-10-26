-- ADR-0012: единая ступень кю/дан как источник истины для пояса.
--
-- Колонки добавляются nullable намеренно. Миграция заполняет только те записи,
-- где ступень выводится однозначно; противоречия (например, «синий пояс без
-- единой аттестации») остаются пустыми и попадают в отчёт `pnpm ranks:report`.
-- Молча подставлять 0 кю таким записям нельзя: это угадывание, а не миграция.

-- 1. Колонки
ALTER TABLE "athletes" ADD COLUMN "rank" VARCHAR(16);
ALTER TABLE "certifications" ADD COLUMN "rank" VARCHAR(16);

-- 2. Аттестации: ступень из вида и номера.
--    Границы проверяются явно: `stage_number = 0` для дана или `11` для кю —
--    повреждение данных, и такое значение не должно превратиться в валидный id.
UPDATE "certifications"
SET "rank" = lower("stage_kind"::text) || '-' || "stage_number"
WHERE ("stage_kind"::text = 'KYU' AND "stage_number" BETWEEN 0 AND 10)
   OR ("stage_kind"::text = 'DAN' AND "stage_number" BETWEEN 1 AND 10);

-- 3. Спортсмены: текущая ступень по последней аттестации.
--    Сортировка: сначала дата аттестации, при равенстве — время создания, чтобы
--    две аттестации одного дня разрешались детерминированно.
UPDATE "athletes" AS athlete
SET "rank" = latest."rank"
FROM (
  SELECT DISTINCT ON ("athlete_id") "athlete_id", "rank"
  FROM "certifications"
  WHERE "rank" IS NOT NULL
  ORDER BY "athlete_id", "certified_on" DESC, "created_at" DESC
) AS latest
WHERE athlete."id" = latest."athlete_id";

-- 4. Остальные: белый пояс — это и есть начальная ступень 0 кю.
--    Пояс ставится в соответствие через явное сравнение, а не «по умолчанию»:
--    запись с непустым поясом и без аттестаций остаётся без ступени.
UPDATE "athletes"
SET "rank" = 'kyu-0'
WHERE "rank" IS NULL
  AND "belt_grade"::text = 'WHITE';

-- 5. Отчёт: записи, где ступень не выведена. В лог миграции, чтобы после выката
--    было видно, сколько строк требует ручного решения.
DO $$
DECLARE
  unresolved_athletes INTEGER;
  unresolved_certifications INTEGER;
BEGIN
  SELECT count(*) INTO unresolved_athletes FROM "athletes" WHERE "rank" IS NULL;
  SELECT count(*) INTO unresolved_certifications FROM "certifications" WHERE "rank" IS NULL;

  RAISE NOTICE 'rank backfill: спортсменов без ступени — %, аттестаций без ступени — %',
    unresolved_athletes, unresolved_certifications;
END $$;
