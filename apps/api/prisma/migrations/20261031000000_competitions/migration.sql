-- Соревнования: турниры, категории, участия и встречи (#36–#38).
--
-- Оплата живёт на участнике турнира, а не на участии: платят за турнир, а не за
-- дисциплину. Поэтому кумитэ и ката одного спортсмена — разные участия с разными
-- результатами, но общая оплата.

CREATE TYPE "CompetitionStatus" AS ENUM (
  'DRAFT', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'PUBLISHED', 'CANCELLED'
);
CREATE TYPE "CompetitionLevel" AS ENUM ('CLUB', 'CITY', 'REGIONAL', 'NATIONAL', 'INTERNATIONAL');
CREATE TYPE "CompetitionDiscipline" AS ENUM ('KUMITE', 'KATA');
CREATE TYPE "CompetitionEntryResult" AS ENUM (
  'PENDING', 'PLACED', 'PARTICIPATED', 'ELIMINATED', 'DISQUALIFIED', 'NO_SHOW'
);
CREATE TYPE "CompetitionMedal" AS ENUM ('NONE', 'GOLD', 'SILVER', 'BRONZE');
CREATE TYPE "CompetitionMatchResult" AS ENUM ('WIN', 'LOSS');

CREATE TABLE "competitions" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "location" VARCHAR(200),
    "organizer" VARCHAR(200),
    "level" "CompetitionLevel" NOT NULL DEFAULT 'CLUB',
    "description" VARCHAR(2000),
    "status" "CompetitionStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "competitions_starts_at_idx" ON "competitions"("starts_at");
CREATE INDEX "competitions_status_idx" ON "competitions"("status");

CREATE TABLE "competition_categories" (
    "id" UUID NOT NULL,
    -- NULL — общая категория клуба; заполнено — категория конкретного турнира.
    "competition_id" UUID,
    "discipline" "CompetitionDiscipline" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "age_from" INTEGER,
    "age_to" INTEGER,
    "weight_from" DECIMAL(5,1),
    "weight_to" DECIMAL(5,1),
    "belt_from" VARCHAR(16),
    "belt_to" VARCHAR(16),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competition_categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "competition_categories_discipline_is_active_idx"
    ON "competition_categories"("discipline", "is_active");

CREATE TABLE "competition_participants" (
    "id" UUID NOT NULL,
    "competition_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "responsible_trainer_id" UUID,
    "payment_status" "ParticipantPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competition_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "competition_participants_competition_id_athlete_id_key"
    ON "competition_participants"("competition_id", "athlete_id");
CREATE INDEX "competition_participants_athlete_id_idx"
    ON "competition_participants"("athlete_id");

CREATE TABLE "competition_entries" (
    "id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "discipline" "CompetitionDiscipline" NOT NULL,
    -- Снимок названия: правка справочника не должна переписывать историю.
    "category_snapshot" VARCHAR(200) NOT NULL,
    "result" "CompetitionEntryResult" NOT NULL DEFAULT 'PENDING',
    "place" INTEGER,
    "medal" "CompetitionMedal" NOT NULL DEFAULT 'NONE',
    "comment" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competition_entries_pkey" PRIMARY KEY ("id")
);

-- Дубликат «тот же спортсмен в той же категории» запрещён; разные дисциплины и
-- категории одного турнира — разрешены.
CREATE UNIQUE INDEX "competition_entries_participant_id_category_id_key"
    ON "competition_entries"("participant_id", "category_id");

CREATE TABLE "competition_matches" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "opponent_name" VARCHAR(200) NOT NULL,
    "opponent_club" VARCHAR(200),
    "result" "CompetitionMatchResult" NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_matches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "competition_matches_entry_id_round_idx"
    ON "competition_matches"("entry_id", "round");

ALTER TABLE "competitions"
    ADD CONSTRAINT "competitions_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "competitions"
    ADD CONSTRAINT "competitions_published_by_id_fkey"
    FOREIGN KEY ("published_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "competition_categories"
    ADD CONSTRAINT "competition_categories_competition_id_fkey"
    FOREIGN KEY ("competition_id") REFERENCES "competitions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "competition_participants"
    ADD CONSTRAINT "competition_participants_competition_id_fkey"
    FOREIGN KEY ("competition_id") REFERENCES "competitions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "competition_participants"
    ADD CONSTRAINT "competition_participants_athlete_id_fkey"
    FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "competition_participants"
    ADD CONSTRAINT "competition_participants_responsible_trainer_id_fkey"
    FOREIGN KEY ("responsible_trainer_id") REFERENCES "trainer_profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "competition_entries"
    ADD CONSTRAINT "competition_entries_participant_id_fkey"
    FOREIGN KEY ("participant_id") REFERENCES "competition_participants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "competition_entries"
    ADD CONSTRAINT "competition_entries_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "competition_categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "competition_matches"
    ADD CONSTRAINT "competition_matches_entry_id_fkey"
    FOREIGN KEY ("entry_id") REFERENCES "competition_entries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Версии результата участия: исправления опубликованных результатов сохраняют
-- прежнее значение и автора (#38).
CREATE TABLE "competition_entry_revisions" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "result" "CompetitionEntryResult" NOT NULL,
    "place" INTEGER,
    "medal" "CompetitionMedal" NOT NULL DEFAULT 'NONE',
    "comment" VARCHAR(1000),
    "changed_by_id" UUID,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(500),

    CONSTRAINT "competition_entry_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "competition_entry_revisions_entry_id_version_key"
    ON "competition_entry_revisions"("entry_id", "version");

ALTER TABLE "competition_entry_revisions"
    ADD CONSTRAINT "competition_entry_revisions_entry_id_fkey"
    FOREIGN KEY ("entry_id") REFERENCES "competition_entries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "competition_entry_revisions"
    ADD CONSTRAINT "competition_entry_revisions_changed_by_id_fkey"
    FOREIGN KEY ("changed_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;