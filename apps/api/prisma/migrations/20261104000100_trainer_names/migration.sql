-- Тренер: имя и фамилия отдельно (#69, ADR-0016).
--
-- Старое поле display_name остаётся для отображения, но собирается из частей.

ALTER TABLE "trainer_profiles" ADD COLUMN "first_name" TEXT;
ALTER TABLE "trainer_profiles" ADD COLUMN "last_name" TEXT;

-- «Иванов Иван» / «Иванов А. С.»: первое слово — фамилия, остаток — имя.
UPDATE "trainer_profiles"
SET "last_name" = split_part(btrim("display_name"), ' ', 1),
    "first_name" = btrim(substr(btrim("display_name"), length(split_part(btrim("display_name"), ' ', 1)) + 1))
WHERE btrim("display_name") <> '';
