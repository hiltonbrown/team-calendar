-- CreateEnum
CREATE TYPE "xero_inactivity_kind" AS ENUM ('active', 'unknown', 'candidate');

-- CreateEnum
CREATE TYPE "xero_inactivity_review_status" AS ENUM ('unreviewed', 'reviewed_keep', 'reviewed_escalate');

-- CreateTable
CREATE TABLE "xero_inactivity_classifications" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "xero_tenant_id" UUID NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "kind" "xero_inactivity_kind" NOT NULL,
    "reason" TEXT NOT NULL,
    "review_status" "xero_inactivity_review_status" NOT NULL DEFAULT 'unreviewed',
    "classified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_inactivity_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "xero_inactivity_classifications_clerk_org_id_idx" ON "xero_inactivity_classifications"("clerk_org_id");

-- CreateIndex
CREATE INDEX "xero_inactivity_classifications_organisation_id_idx" ON "xero_inactivity_classifications"("organisation_id");

-- CreateIndex
CREATE INDEX "xero_inactivity_classifications_xero_tenant_id_idx" ON "xero_inactivity_classifications"("xero_tenant_id");

-- AddForeignKey
ALTER TABLE "xero_inactivity_classifications" ADD CONSTRAINT "xero_inactivity_classifications_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_inactivity_classifications" ADD CONSTRAINT "xero_inactivity_classifications_xero_tenant_id_fkey" FOREIGN KEY ("xero_tenant_id") REFERENCES "xero_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
