-- Мероприятия аттестаций, участники и версии результатов (#33–#35).
--
-- До этой миграции аттестация была только записью «кому и когда присвоили
-- ступень». Экзамен как событие отсутствовал: нельзя было ни запланировать его,
-- ни собрать список допущенных, ни отделить «сдал» от «присвоили задним числом».

CREATE TYPE "CertificationEventStatus" AS ENUM (
  'DRAFT', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'PUBLISHED', 'CANCELLED'
);
CREATE TYPE "ParticipantAdmission" AS ENUM ('PENDING', 'ADMITTED', 'REJECTED');
CREATE TYPE "ParticipantPaymentStatus" AS ENUM ('UNPAID', 'PAID');
CREATE TYPE "ParticipantResult" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'NO_SHOW');

CREATE TABLE "certification_events" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "location" VARCHAR(200),
    "organizer" VARCHAR(200),
    "description" VARCHAR(2000),
    "status" "CertificationEventStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "certification_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "certification_events_scheduled_at_idx" ON "certification_events"("scheduled_at");
CREATE INDEX "certification_events_status_idx" ON "certification_events"("status");

CREATE TABLE "certification_participants" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    -- Ответственный за результат хранится отдельно от групп: при переводе
    -- спортсмена в другую группу право исправлять исторический результат
    -- остаётся у того, кто вёл экзамен.
    "responsible_trainer_id" UUID,
    "target_rank" VARCHAR(16) NOT NULL,
    "snapshot_rank" VARCHAR(16),
    "admission" "ParticipantAdmission" NOT NULL DEFAULT 'PENDING',
    "payment_status" "ParticipantPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "result" "ParticipantResult" NOT NULL DEFAULT 'PENDING',
    "awarded_rank" VARCHAR(16),
    "result_comment" VARCHAR(1000),
    "certification_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certification_participants_pkey" PRIMARY KEY ("id")
);

-- Дубль участника испортил бы и список, и подсчёт итогов — уникальность в БД.
CREATE UNIQUE INDEX "certification_participants_event_id_athlete_id_key"
    ON "certification_participants"("event_id", "athlete_id");
CREATE INDEX "certification_participants_athlete_id_idx"
    ON "certification_participants"("athlete_id");
-- Одна аттестация на участника: повторное сохранение результата не создаёт дублей.
CREATE UNIQUE INDEX "certification_participants_certification_id_key"
    ON "certification_participants"("certification_id");

CREATE TABLE "certification_result_revisions" (
    "id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "result" "ParticipantResult" NOT NULL,
    "awarded_rank" VARCHAR(16),
    "comment" VARCHAR(1000),
    "changed_by_id" UUID,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(500),

    CONSTRAINT "certification_result_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "certification_result_revisions_participant_id_version_key"
    ON "certification_result_revisions"("participant_id", "version");

ALTER TABLE "certification_events"
    ADD CONSTRAINT "certification_events_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "certification_events"
    ADD CONSTRAINT "certification_events_published_by_id_fkey"
    FOREIGN KEY ("published_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "certification_participants"
    ADD CONSTRAINT "certification_participants_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "certification_events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "certification_participants"
    ADD CONSTRAINT "certification_participants_athlete_id_fkey"
    FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "certification_participants"
    ADD CONSTRAINT "certification_participants_responsible_trainer_id_fkey"
    FOREIGN KEY ("responsible_trainer_id") REFERENCES "trainer_profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "certification_participants"
    ADD CONSTRAINT "certification_participants_certification_id_fkey"
    FOREIGN KEY ("certification_id") REFERENCES "certifications"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "certification_result_revisions"
    ADD CONSTRAINT "certification_result_revisions_participant_id_fkey"
    FOREIGN KEY ("participant_id") REFERENCES "certification_participants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "certification_result_revisions"
    ADD CONSTRAINT "certification_result_revisions_changed_by_id_fkey"
    FOREIGN KEY ("changed_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
