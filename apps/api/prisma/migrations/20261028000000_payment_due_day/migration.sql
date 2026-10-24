-- Срок оплаты месяца (настройка клуба).
--
-- День месяца, до которого нужно оплатить текущий месяц: «за октябрь — до 10
-- октября». Верхняя граница 28: иначе в феврале срок «30-е» не существовал бы,
-- и просрочка зависела бы от месяца.

ALTER TABLE "club_profile"
    ADD COLUMN "payment_due_day" INTEGER;

ALTER TABLE "club_profile"
    ADD CONSTRAINT "club_profile_payment_due_day_range" CHECK (
        "payment_due_day" IS NULL OR ("payment_due_day" >= 1 AND "payment_due_day" <= 28)
    );
