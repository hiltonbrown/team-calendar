-- CreateTable
CREATE TABLE "account_settings" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "manager_visibility_scope" TEXT NOT NULL DEFAULT 'direct_reports_only',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_settings_clerk_org_id_key" ON "account_settings"("clerk_org_id");

-- CreateIndex
CREATE INDEX "account_settings_clerk_org_id_idx" ON "account_settings"("clerk_org_id");
-- Manager visibility is an account policy, never a company policy.
ALTER TABLE "account_settings" ADD CONSTRAINT "account_settings_manager_visibility_scope_check"
    CHECK ("manager_visibility_scope" IN ('direct_reports_only', 'all_team_leave'));

-- Preserve the most restrictive policy if seeded company settings disagree.
INSERT INTO "account_settings" ("id", "clerk_org_id", "manager_visibility_scope", "created_at", "updated_at")
SELECT gen_random_uuid(), "clerk_org_id",
       CASE WHEN bool_and("manager_visibility_scope" = 'all_team_leave')
            THEN 'all_team_leave' ELSE 'direct_reports_only' END,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organisation_settings"
GROUP BY "clerk_org_id"
ON CONFLICT ("clerk_org_id") DO NOTHING;

ALTER TABLE "account_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "account_settings" TO team_calendar_app
    USING (clerk_org_id = current_setting('app.clerk_org_id', true))
    WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "account_settings" TO team_calendar_app;
