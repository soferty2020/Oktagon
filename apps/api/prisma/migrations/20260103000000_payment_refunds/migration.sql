-- ADR-0010: возврат денег — отдельное движение средств.
--
-- Возврат не удаляет поступление: деньги сначала поступили, потом были
-- возвращены, и оба факта остаются в истории (BR-007). Направление задается
-- признаком kind, сумма всегда положительна.
--
-- `refunded_amount` денормализует сумму возвратов рядом с `paid_amount`, потому
-- что статус периода и задолженность считаются по нетто (поступления минус
-- возвраты). Обе величины пересчитываются вместе, поэтому разойтись не могут.
--
-- Связь возврата с поступлением — nullable: возврат бывает корректировкой
-- периода без привязки к конкретному поступлению. ON DELETE RESTRICT у связи
-- защищает историю: поступление с возвратами удалить нельзя, иначе возврат
-- потерял бы основание (отмена такого поступления отклоняется сервисом).

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PAYMENT', 'REFUND');

-- AlterTable
ALTER TABLE "membership_periods"
  ADD COLUMN "refunded_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payment_transactions"
  ADD COLUMN "kind" "PaymentKind" NOT NULL DEFAULT 'PAYMENT',
  ADD COLUMN "refunded_payment_id" UUID;

-- CreateIndex
CREATE INDEX "payment_transactions_refunded_payment_id_idx"
  ON "payment_transactions"("refunded_payment_id");

-- AddForeignKey
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_refunded_payment_id_fkey"
  FOREIGN KEY ("refunded_payment_id") REFERENCES "payment_transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
