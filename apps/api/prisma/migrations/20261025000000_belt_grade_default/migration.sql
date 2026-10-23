-- Белый пояс — значение по умолчанию (уточнение K3).
--
-- Пояс есть у каждого спортсмена с момента заведения карточки: белый — это
-- ступень, с которой начинают, а не отсутствие данных. Существующим спортсменам
-- без пояса проставляется белый, иначе остались бы строки, которые нельзя
-- отличить от «еще не заполнили».

UPDATE "athletes" SET "belt_grade" = 'WHITE' WHERE "belt_grade" IS NULL;

ALTER TABLE "athletes"
    ALTER COLUMN "belt_grade" SET DEFAULT 'WHITE',
    ALTER COLUMN "belt_grade" SET NOT NULL;
