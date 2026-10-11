-- DropForeignKey
ALTER TABLE "feeds" DROP CONSTRAINT "feeds_organisation_id_fkey";

-- DropForeignKey
ALTER TABLE "feed_tokens" DROP CONSTRAINT "feed_tokens_organisation_id_fkey";

-- DropIndex
DROP INDEX "xero_connections_xero_tenant_id_key";

-- DropIndex
DROP INDEX "xero_connections_remote_connection_id_key";

-- AlterTable
ALTER TABLE "xero_connections" ADD COLUMN     "released_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "feeds" ALTER COLUMN "organisation_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "feed_event_publications" ALTER COLUMN "organisation_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "feed_scopes" ALTER COLUMN "organisation_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "feed_tokens" ALTER COLUMN "organisation_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "xero_connections_owned_tenant_key" ON "xero_connections"("xero_tenant_id") WHERE (released_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "xero_connections_owned_remote_connection_key" ON "xero_connections"("remote_connection_id") WHERE (released_at IS NULL AND remote_connection_id IS NOT NULL);

-- AddForeignKey
ALTER TABLE "feeds" ADD CONSTRAINT "feeds_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_tokens" ADD CONSTRAINT "feed_tokens_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Promote existing default account feeds in place. Token ID and hash define
-- signed URLs; neither changes during this backfill.
UPDATE feeds f SET organisation_id = NULL
WHERE EXISTS (
  SELECT 1 FROM audit_events a
  WHERE a.clerk_org_id = f.clerk_org_id
    AND a.resource_id = f.id::text
    AND a.resource_type = 'feed'
    AND a.action = 'feeds.created'
    AND a.payload->>'defaultFeed' = 'true'
);
UPDATE feed_tokens t SET organisation_id = NULL
FROM feeds f WHERE t.feed_id = f.id AND t.clerk_org_id = f.clerk_org_id AND f.organisation_id IS NULL;
UPDATE feed_scopes s SET organisation_id = NULL
FROM feeds f WHERE s.feed_id = f.id AND s.clerk_org_id = f.clerk_org_id AND f.organisation_id IS NULL;
UPDATE feed_event_publications p SET organisation_id = NULL
FROM feeds f WHERE p.feed_id = f.id AND p.clerk_org_id = f.clerk_org_id AND f.organisation_id IS NULL;

-- Update existing Premium accounts as part of deployment, not only seeding.
UPDATE plan_limits limits SET limit_value = 5, updated_at = CURRENT_TIMESTAMP
FROM plans plan WHERE limits.plan_id = plan.id
  AND limits.limit_type = 'payroll_entities'
  AND (plan.plan_key = 'premium' OR plan.key = 'premium')
  AND limits.limit_value IS DISTINCT FROM 5;
