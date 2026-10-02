ALTER TYPE "RewardStatus" ADD VALUE 'APPROVED';

ALTER TABLE "policies" ADD COLUMN "retention_days" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "policies" ADD CONSTRAINT "policies_retention_days_check" CHECK ("retention_days" BETWEEN 1 AND 365);
ALTER TABLE "job_demands" ADD COLUMN "city" VARCHAR(64), ADD COLUMN "category" VARCHAR(64), ADD COLUMN "benefits" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "referral_reward_records" ADD COLUMN "approved_at" TIMESTAMP(3), ADD COLUMN "approved_by_id" UUID;
ALTER TABLE "referral_reward_records" ADD CONSTRAINT "referral_reward_records_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One direct referrer and one reward per person/job. Existing duplicates must be
-- reviewed before this migration; never silently delete financial history.
CREATE UNIQUE INDEX "referral_records_person_id_job_demand_id_key" ON "referral_records"("person_id", "job_demand_id");

CREATE TABLE "referral_reward_payments" (
  "id" UUID NOT NULL,
  "reward_id" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reference" VARCHAR(120) NOT NULL,
  "proof" VARCHAR(1000) NOT NULL,
  "paid_at" TIMESTAMP(3) NOT NULL,
  "paid_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_reward_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "referral_reward_payments_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "referral_reward_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "referral_reward_payments_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "referral_reward_payments_reward_id_key" ON "referral_reward_payments"("reward_id");
CREATE UNIQUE INDEX "referral_reward_payments_reference_key" ON "referral_reward_payments"("reference");
CREATE INDEX "referral_reward_payments_paid_by_id_paid_at_idx" ON "referral_reward_payments"("paid_by_id", "paid_at");
