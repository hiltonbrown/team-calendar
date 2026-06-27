-- Clerk Billing slice: additive billing schema for the Basic / Premium / Enterprise
-- catalogue. Mirrors Clerk billing state and enforces the limits Clerk cannot.
-- Strictly additive: no columns or constraints are dropped. The legacy
-- metric_key usage_counters rows and their unique constraint are preserved so
-- the prior billing surface keeps working while the new generic enforcement
-- path writes counter_type rows.

-- New enum values on the existing plan_limit_type enum. `feeds` already exists.
ALTER TYPE "plan_limit_type" ADD VALUE IF NOT EXISTS 'payroll_entities';
ALTER TYPE "plan_limit_type" ADD VALUE IF NOT EXISTS 'seats';

-- Billing cadence mirrored from Clerk.
CREATE TYPE "billing_interval" AS ENUM ('month', 'year');

-- Typed hard-limit counter dimensions. Mirrors the LimitType union in @repo/core.
CREATE TYPE "usage_counter_type" AS ENUM ('payroll_entities', 'seats', 'feeds');

-- plans: Clerk plan identity and bespoke-plan flag.
ALTER TABLE "plans" ADD COLUMN "clerk_plan_key" TEXT;
ALTER TABLE "plans" ADD COLUMN "is_custom" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "plans_clerk_plan_key_key" ON "plans"("clerk_plan_key");

-- clerk_org_subscriptions: mirrored Clerk plan slug, scheduled-cancellation flag,
-- and billing cadence. status and current_period_end already exist.
ALTER TABLE "clerk_org_subscriptions" ADD COLUMN "clerk_plan_key" TEXT;
ALTER TABLE "clerk_org_subscriptions" ADD COLUMN "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "clerk_org_subscriptions" ADD COLUMN "billing_interval" "billing_interval";

-- usage_counters: typed counter dimension plus a one-row-per-(org, type) unique.
-- Nullable so legacy metric_key rows coexist; Postgres treats NULLs as distinct
-- so the existing rows do not collide under the new unique index.
ALTER TABLE "usage_counters" ADD COLUMN "counter_type" "usage_counter_type";
CREATE UNIQUE INDEX "usage_counters_clerk_org_id_counter_type_key" ON "usage_counters"("clerk_org_id", "counter_type");
