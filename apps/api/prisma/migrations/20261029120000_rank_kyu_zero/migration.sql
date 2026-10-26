-- ADR-0012: 0 кю — начальная ступень, и ей соответствует номер 0.
--
-- Старое ограничение `certifications_stage_number_range` требовало номер от 1 до
-- 10: тогда кю начинались с 10, а 0 кю не существовал. Теперь 0 кю — белый пояс
-- без экзамена, и вставка аттестации на него падала на нарушении CHECK
-- (`23514`), что выяснилось только на db-e2e.
--
-- Правило зависит от вида: у кю номера 0–10, у дана — 1–10. Одним диапазоном это
-- не выразить, поэтому ограничение заменяется на условное.

ALTER TABLE "certifications" DROP CONSTRAINT IF EXISTS "certifications_stage_number_range";

ALTER TABLE "certifications"
  ADD CONSTRAINT "certifications_stage_number_range"
  CHECK (
    ("stage_kind" = 'KYU' AND "stage_number" BETWEEN 0 AND 10)
    OR ("stage_kind" = 'DAN' AND "stage_number" BETWEEN 1 AND 10)
  );
