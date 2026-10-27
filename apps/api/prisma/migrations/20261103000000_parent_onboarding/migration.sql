-- Онбординг родителей (#58, ADR-0015): заявки на привязку и коды привязки.

-- CreateEnum
CREATE TYPE "LinkRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "link_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "birth_date" DATE,
    "phone" TEXT,
    "status" "LinkRequestStatus" NOT NULL DEFAULT 'PENDING',
    "athlete_id" UUID,
    "reject_reason" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "link_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete_link_codes" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "created_by" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "used_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "athlete_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "athlete_link_codes_code_hash_key" ON "athlete_link_codes"("code_hash");

-- CreateIndex
CREATE INDEX "athlete_link_codes_athlete_id_idx" ON "athlete_link_codes"("athlete_id");

-- CreateIndex
CREATE INDEX "link_requests_status_idx" ON "link_requests"("status");

-- CreateIndex
CREATE INDEX "link_requests_user_id_idx" ON "link_requests"("user_id");

-- AddForeignKey
ALTER TABLE "link_requests" ADD CONSTRAINT "link_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_requests" ADD CONSTRAINT "link_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_requests" ADD CONSTRAINT "link_requests_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_link_codes" ADD CONSTRAINT "athlete_link_codes_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_link_codes" ADD CONSTRAINT "athlete_link_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_link_codes" ADD CONSTRAINT "athlete_link_codes_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
