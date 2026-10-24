-- Аттестации: событие присвоения ступени и пояса (карате: кю и даны).
--
-- Пояс хранится и в карточке спортсмена, но аттестация — это событие с датой и
-- ступенью: карточка показывает текущее состояние, история отвечает на вопрос
-- «какая ступень и когда получена».

CREATE TYPE "CertificationStageKind" AS ENUM ('KYU', 'DAN');

CREATE TABLE "certifications" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "certified_on" DATE NOT NULL,
    "belt_grade" "BeltGrade" NOT NULL,
    "stage_kind" "CertificationStageKind" NOT NULL DEFAULT 'KYU',
    "stage_number" INTEGER NOT NULL,
    "note" VARCHAR(500),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "certifications_athlete_id_certified_on_idx"
    ON "certifications"("athlete_id", "certified_on");

ALTER TABLE "certifications"
    ADD CONSTRAINT "certifications_athlete_id_fkey"
    FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "certifications"
    ADD CONSTRAINT "certifications_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Ступень: 1..10 и для кю, и для дана. Верхняя граница защищает от опечатки
-- («12 кю» не существует), нижняя — от нуля.
ALTER TABLE "certifications"
    ADD CONSTRAINT "certifications_stage_number_range" CHECK (
        "stage_number" >= 1 AND "stage_number" <= 10
    );
