-- Заявки на пробную тренировку (ADR-0013, #25).
--
-- Заявка — отдельная сущность, а не спортсмен: до знакомства известны только имя
-- и телефон, и заводить карточку на каждого звонящего означало бы мусор в
-- справочнике.

CREATE TYPE "TrialRequestStatus" AS ENUM (
  'NEW', 'CONTACTED', 'TRIAL_SCHEDULED', 'CONVERTED', 'REJECTED'
);

CREATE TABLE "trial_requests" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "email" VARCHAR(200),
    "child_name" VARCHAR(200),
    -- Возраст, а не дата рождения: на этом шаге её обычно не знают.
    "child_age" INTEGER,
    "comment" VARCHAR(2000),
    "source" VARCHAR(100),
    "status" "TrialRequestStatus" NOT NULL DEFAULT 'NEW',
    "processed_at" TIMESTAMP(3),
    "processed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trial_requests_pkey" PRIMARY KEY ("id")
);

-- Список администратора сортируется по статусу и дате: новые сверху.
CREATE INDEX "trial_requests_status_created_at_idx"
    ON "trial_requests"("status", "created_at");

ALTER TABLE "trial_requests"
    ADD CONSTRAINT "trial_requests_processed_by_id_fkey"
    FOREIGN KEY ("processed_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
