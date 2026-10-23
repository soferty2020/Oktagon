-- Правила расчета задолженности (K5, ADR-0014, BR-014).
--
-- Версии вместо «текущих настроек»: отчет за октябрь должен считаться по
-- октябрьским правилам, даже если в ноябре их изменили.

CREATE TYPE "DebtNoTrainingPolicy" AS ENUM ('EXEMPT', 'DEBTOR');
CREATE TYPE "DebtFreezePolicy" AS ENUM ('EXEMPT_MONTH', 'NONE');
CREATE TYPE "DebtExpectedMissing" AS ENUM ('DEBTOR', 'NOT_DEBTOR');
CREATE TYPE "DebtToleranceKind" AS ENUM ('NONE', 'FIXED', 'PERCENT');

CREATE TABLE "debt_rules" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "use_fully_paid_mark" BOOLEAN NOT NULL DEFAULT true,
    "no_training_policy" "DebtNoTrainingPolicy" NOT NULL DEFAULT 'EXEMPT',
    "freeze_policy" "DebtFreezePolicy" NOT NULL DEFAULT 'EXEMPT_MONTH',
    "expected_missing" "DebtExpectedMissing" NOT NULL DEFAULT 'DEBTOR',
    "tolerance_kind" "DebtToleranceKind" NOT NULL DEFAULT 'NONE',
    "tolerance_amount" DECIMAL(12,2),
    "tolerance_percent" DECIMAL(5,2),
    "note" VARCHAR(500),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "debt_rules_version_key" ON "debt_rules"("version");
CREATE UNIQUE INDEX "debt_rules_effective_from_key" ON "debt_rules"("effective_from");

ALTER TABLE "debt_rules"
    ADD CONSTRAINT "debt_rules_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Допуск задается ровно одним способом; иначе получилось бы два противоречащих
-- значения, и расчет зависел бы от порядка проверки.
ALTER TABLE "debt_rules"
    ADD CONSTRAINT "debt_rules_tolerance_matches_kind" CHECK (
        ("tolerance_kind" = 'NONE' AND "tolerance_amount" IS NULL AND "tolerance_percent" IS NULL)
        OR ("tolerance_kind" = 'FIXED' AND "tolerance_amount" IS NOT NULL AND "tolerance_percent" IS NULL)
        OR ("tolerance_kind" = 'PERCENT' AND "tolerance_percent" IS NOT NULL AND "tolerance_amount" IS NULL)
    );

-- Версия 1 — BR-004: создается сразу, чтобы расчет не остался без правил.
-- Первое число текущего месяца: прошлое менять нельзя (ADR-0014).
INSERT INTO "debt_rules" ("id", "version", "effective_from", "note")
VALUES (
    gen_random_uuid(),
    1,
    date_trunc('month', CURRENT_DATE)::date,
    'Значения по умолчанию: BR-004'
);
