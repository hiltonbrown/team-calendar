-- AlterTable
ALTER TABLE "xero_tenants" ADD COLUMN     "active_slot" INTEGER,
ADD COLUMN     "binding_generation" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "provider_app_id" TEXT,
ADD COLUMN     "retired_at" TIMESTAMP(3),
ADD COLUMN     "retirement_reason" TEXT;

-- AlterTable
ALTER TABLE "xero_oauth_sessions" ADD COLUMN     "expected_binding_generation" INTEGER;

-- Reviewed by hand: Prisma cannot express CHECK constraints
ALTER TABLE "xero_tenants"
  ADD CONSTRAINT "xero_tenants_active_slot_check"
  CHECK ("active_slot" IS NULL OR "active_slot" = 1);
