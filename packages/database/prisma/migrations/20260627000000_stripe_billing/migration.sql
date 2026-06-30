ALTER TYPE "plan_limit_type" ADD VALUE IF NOT EXISTS 'payroll_entities';
ALTER TYPE "plan_limit_type" ADD VALUE IF NOT EXISTS 'seats';

ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "plan_key" TEXT;
UPDATE "plans" SET "plan_key" = "key" WHERE "plan_key" IS NULL;
ALTER TABLE "plans" ALTER COLUMN "plan_key" SET NOT NULL;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "is_custom" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "stripe_price_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "plans_plan_key_key" ON "plans"("plan_key");

ALTER TABLE "clerk_org_subscriptions" ADD COLUMN IF NOT EXISTS "stripe_customer_id" TEXT;
ALTER TABLE "clerk_org_subscriptions" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" TEXT;
ALTER TABLE "clerk_org_subscriptions" ADD COLUMN IF NOT EXISTS "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "clerk_org_subscriptions" ADD COLUMN IF NOT EXISTS "ended_at" TIMESTAMP(3);

ALTER TABLE "usage_counters" ADD COLUMN IF NOT EXISTS "counter_type" "plan_limit_type";
UPDATE "usage_counters" SET "counter_type" = "metric_key"::"plan_limit_type" WHERE "metric_key" IN ('feeds', 'payroll_entities', 'seats') AND "counter_type" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "usage_counters_clerk_org_id_counter_type_key" ON "usage_counters"("clerk_org_id", "counter_type");

CREATE TABLE IF NOT EXISTS "stripe_events" (
  "id" UUID NOT NULL,
  "stripe_event_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "stripe_events_stripe_event_id_key" ON "stripe_events"("stripe_event_id");
