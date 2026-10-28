-- Согласие на обработку персональных данных в заявке (#56, SEC-15).
--
-- Без согласия заявка не принимается: обрабатывать данные ребёнка нечем.
-- Поля nullable, потому что старые заявки создавались до этого требования.

ALTER TABLE "trial_requests" ADD COLUMN "consent_accepted_at" TIMESTAMP(3);
ALTER TABLE "trial_requests" ADD COLUMN "consent_version" VARCHAR(32);
