-- Reviewed by hand: refuse to tighten until the backfill has run
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "xero_tenants" WHERE "provider_app_id" IS NULL) THEN
    RAISE EXCEPTION 'xero_tenants.provider_app_id is null; run backfill:xero-tenant-binding first';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "xero_tenants" ALTER COLUMN "provider_app_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "xero_tenants_reserved_binding_key" ON "xero_tenants"("provider_app_id", "xero_tenant_id", "active_slot");
