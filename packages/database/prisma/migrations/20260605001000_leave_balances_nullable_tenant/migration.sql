-- AlterTable
ALTER TABLE "leave_balances" ALTER COLUMN "xero_tenant_id" DROP NOT NULL;

-- CreateIndex
-- Partial unique index for admin-managed manual balances. The composite unique on
-- (person_id, xero_tenant_id, leave_type_xero_id) does not guard these rows because
-- PostgreSQL treats NULL as distinct, so a separate partial index is required.
-- Prisma @@unique cannot express a WHERE clause, so this is added via raw SQL.
CREATE UNIQUE INDEX "leave_balances_person_id_leave_type_xero_id_manual_key" ON "leave_balances"("person_id", "leave_type_xero_id") WHERE "xero_tenant_id" IS NULL;
