-- Naming-only migration: preserve text identities, row data and existing grants.
BEGIN;

-- Rename columns in place.
ALTER TABLE "organisations" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "account_settings" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "organisation_settings" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "teams" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "locations" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "people" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "people" RENAME COLUMN "clerk_user_id" TO "user_id";
ALTER TABLE "alternative_contacts" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "xero_connections" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "xero_oauth_sessions" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "xero_sync_cursors" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "availability_records" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "outbound_operations" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "availability_publications" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "leave_balances" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "xero_person_matches" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "xero_person_matches" RENAME COLUMN "resolved_clerk_user_id" TO "resolved_user_id";
ALTER TABLE "public_holidays" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "public_holiday_preferences" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "feeds" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "feed_event_publications" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "feed_scopes" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "feed_tokens" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "notifications" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "notification_preferences" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "notification_email_queue" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "sync_runs" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "failed_records" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "audit_events" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "clerk_org_subscriptions" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "usage_counters" RENAME COLUMN "clerk_org_id" TO "account_id";
ALTER TABLE "stripe_events" RENAME COLUMN "clerk_org_id" TO "account_id";

ALTER TABLE "clerk_org_subscriptions" RENAME TO "account_subscriptions";

-- Match Prisma physical names without rebuilding keys or relations.
ALTER INDEX "organisations_id_clerk_org_id_key" RENAME TO "organisations_id_account_id_key";
ALTER INDEX "organisations_clerk_org_id_idx" RENAME TO "organisations_account_id_idx";
ALTER INDEX "account_settings_clerk_org_id_idx" RENAME TO "account_settings_account_id_idx";
ALTER INDEX "account_settings_clerk_org_id_key" RENAME TO "account_settings_account_id_key";
ALTER INDEX "organisation_settings_clerk_org_id_idx" RENAME TO "organisation_settings_account_id_idx";
ALTER INDEX "teams_clerk_org_id_idx" RENAME TO "teams_account_id_idx";
ALTER INDEX "locations_clerk_org_id_idx" RENAME TO "locations_account_id_idx";
ALTER INDEX "people_organisation_id_clerk_user_id_key" RENAME TO "people_organisation_id_user_id_key";
ALTER INDEX "people_clerk_org_id_idx" RENAME TO "people_account_id_idx";
ALTER INDEX "alternative_contacts_clerk_org_id_idx" RENAME TO "alternative_contacts_account_id_idx";
ALTER INDEX "xero_connections_id_clerk_org_id_organisation_id_key" RENAME TO "xero_connections_id_account_id_organisation_id_key";
ALTER INDEX "xero_connections_organisation_id_clerk_org_id_key" RENAME TO "xero_connections_organisation_id_account_id_key";
ALTER INDEX "xero_connections_clerk_org_id_idx" RENAME TO "xero_connections_account_id_idx";
ALTER INDEX "xero_oauth_sessions_clerk_org_id_idx" RENAME TO "xero_oauth_sessions_account_id_idx";
ALTER INDEX "xero_sync_cursors_clerk_org_id_idx" RENAME TO "xero_sync_cursors_account_id_idx";
ALTER INDEX "availability_records_clerk_org_id_idx" RENAME TO "availability_records_account_id_idx";
ALTER INDEX "outbound_operations_clerk_org_id_idx" RENAME TO "outbound_operations_account_id_idx";
ALTER INDEX "availability_publications_clerk_org_id_idx" RENAME TO "availability_publications_account_id_idx";
ALTER INDEX "leave_balances_clerk_org_id_idx" RENAME TO "leave_balances_account_id_idx";
ALTER INDEX "xero_person_matches_clerk_org_id_idx" RENAME TO "xero_person_matches_account_id_idx";
ALTER INDEX "public_holidays_clerk_org_id_idx" RENAME TO "public_holidays_account_id_idx";
ALTER INDEX "public_holiday_preferences_clerk_org_id_idx" RENAME TO "public_holiday_preferences_account_id_idx";
ALTER INDEX "feeds_clerk_org_id_slug_key" RENAME TO "feeds_account_id_slug_key";
ALTER INDEX "feeds_clerk_org_id_idx" RENAME TO "feeds_account_id_idx";
ALTER INDEX "feed_event_publications_clerk_org_id_idx" RENAME TO "feed_event_publications_account_id_idx";
ALTER INDEX "feed_scopes_clerk_org_id_idx" RENAME TO "feed_scopes_account_id_idx";
ALTER INDEX "feed_tokens_clerk_org_id_idx" RENAME TO "feed_tokens_account_id_idx";
ALTER INDEX "notifications_clerk_org_id_idx" RENAME TO "notifications_account_id_idx";
ALTER INDEX "notification_preferences_clerk_org_id_idx" RENAME TO "notification_preferences_account_id_idx";
ALTER INDEX "notification_email_queue_clerk_org_id_idx" RENAME TO "notification_email_queue_account_id_idx";
ALTER INDEX "sync_runs_clerk_org_id_idx" RENAME TO "sync_runs_account_id_idx";
ALTER INDEX "sync_runs_clerk_org_id_organisation_id_xero_connection_id_r_idx" RENAME TO "sync_runs_account_id_organisation_id_xero_connection_id_run_idx";
ALTER INDEX "failed_records_clerk_org_id_idx" RENAME TO "failed_records_account_id_idx";
ALTER INDEX "audit_events_clerk_org_id_idx" RENAME TO "audit_events_account_id_idx";
ALTER INDEX "clerk_org_subscriptions_clerk_org_id_idx" RENAME TO "account_subscriptions_account_id_idx";
ALTER INDEX "clerk_org_subscriptions_clerk_org_id_key" RENAME TO "account_subscriptions_account_id_key";
ALTER INDEX "usage_counters_clerk_org_id_metric_key_period_start_period__key" RENAME TO "usage_counters_account_id_metric_key_period_start_period_en_key";
ALTER INDEX "usage_counters_clerk_org_id_counter_type_key" RENAME TO "usage_counters_account_id_counter_type_key";
ALTER INDEX "usage_counters_clerk_org_id_idx" RENAME TO "usage_counters_account_id_idx";
ALTER INDEX "stripe_events_clerk_org_id_delivery_state_event_created_at_idx" RENAME TO "stripe_events_account_id_delivery_state_event_created_at_idx";
ALTER TABLE "xero_connections" RENAME CONSTRAINT "xero_connections_organisation_id_clerk_org_id_fkey" TO "xero_connections_organisation_id_account_id_fkey";
ALTER TABLE "xero_oauth_sessions" RENAME CONSTRAINT "xero_oauth_sessions_organisation_id_clerk_org_id_fkey" TO "xero_oauth_sessions_organisation_id_account_id_fkey";
ALTER TABLE "xero_sync_cursors" RENAME CONSTRAINT "xero_sync_cursors_xero_connection_id_clerk_org_id_organisa_fkey" TO "xero_sync_cursors_xero_connection_id_account_id_organisati_fkey";
ALTER TABLE "leave_balances" RENAME CONSTRAINT "leave_balances_xero_connection_id_clerk_org_id_organisatio_fkey" TO "leave_balances_xero_connection_id_account_id_organisation__fkey";
ALTER TABLE "sync_runs" RENAME CONSTRAINT "sync_runs_xero_connection_id_clerk_org_id_organisation_id_fkey" TO "sync_runs_xero_connection_id_account_id_organisation_id_fkey";
ALTER TABLE "account_subscriptions" RENAME CONSTRAINT "clerk_org_subscriptions_plan_key_fkey" TO "account_subscriptions_plan_key_fkey";
ALTER TABLE "account_subscriptions" RENAME CONSTRAINT "clerk_org_subscriptions_pkey" TO "account_subscriptions_pkey";

-- Retain the SECURITY DEFINER boundary, fixed search path and execute grants.
CREATE OR REPLACE FUNCTION public.tc_manager_belongs_to_account(manager_id uuid, account_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT $2 = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = manager_id AND p.account_id = $2
        AND EXISTS (SELECT 1 FROM public.organisations o WHERE o.id = p.organisation_id AND o.account_id = $2)
    );
$$;
REVOKE ALL ON FUNCTION public.tc_manager_belongs_to_account(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tc_manager_belongs_to_account(uuid, text) TO team_calendar_app;

-- Recreate every final tenant policy with the renamed transaction setting.
DROP POLICY tenant_isolation ON "organisations";
CREATE POLICY tenant_isolation ON organisations TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true));

DROP POLICY tenant_isolation ON "organisation_settings";
CREATE POLICY tenant_isolation ON organisation_settings TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = organisation_settings.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "teams";
CREATE POLICY tenant_isolation ON teams TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = teams.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "locations";
CREATE POLICY tenant_isolation ON locations TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = locations.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "people";
CREATE POLICY tenant_isolation ON people TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
WITH CHECK (
  account_id = current_setting('app.account_id', true)
  AND EXISTS (
    SELECT 1 FROM public.organisations o
    WHERE o.id = people.organisation_id
      AND o.account_id = current_setting('app.account_id', true)
  )
  AND (
    manager_person_id IS NULL
    OR public.tc_manager_belongs_to_account(manager_person_id, account_id)
  )
);

DROP POLICY tenant_isolation ON "alternative_contacts";
CREATE POLICY tenant_isolation ON alternative_contacts TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = alternative_contacts.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "xero_connections";
CREATE POLICY tenant_isolation ON xero_connections TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = xero_connections.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "xero_oauth_sessions";
CREATE POLICY tenant_isolation ON xero_oauth_sessions TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = xero_oauth_sessions.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "xero_sync_cursors";
CREATE POLICY tenant_isolation ON xero_sync_cursors TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = xero_sync_cursors.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "availability_records";
CREATE POLICY tenant_isolation ON availability_records TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = availability_records.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "outbound_operations";
CREATE POLICY tenant_isolation ON outbound_operations TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = outbound_operations.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "availability_publications";
CREATE POLICY tenant_isolation ON availability_publications TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = availability_publications.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "leave_balances";
CREATE POLICY tenant_isolation ON leave_balances TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = leave_balances.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "xero_person_matches";
CREATE POLICY tenant_isolation ON xero_person_matches TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = xero_person_matches.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "public_holidays";
CREATE POLICY tenant_isolation ON public_holidays TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = public_holidays.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "public_holiday_preferences";
CREATE POLICY tenant_isolation ON public_holiday_preferences TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = public_holiday_preferences.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "feeds";
CREATE POLICY tenant_isolation ON feeds TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = feeds.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "feed_event_publications";
CREATE POLICY tenant_isolation ON feed_event_publications TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = feed_event_publications.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "feed_scopes";
CREATE POLICY tenant_isolation ON feed_scopes TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = feed_scopes.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "feed_tokens";
CREATE POLICY tenant_isolation ON feed_tokens TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = feed_tokens.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "notifications";
CREATE POLICY tenant_isolation ON notifications TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = notifications.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "notification_preferences";
CREATE POLICY tenant_isolation ON notification_preferences TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = notification_preferences.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "notification_email_queue";
CREATE POLICY tenant_isolation ON notification_email_queue TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = notification_email_queue.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "sync_runs";
CREATE POLICY tenant_isolation ON sync_runs TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = sync_runs.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "failed_records";
CREATE POLICY tenant_isolation ON failed_records TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = failed_records.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "audit_events";
CREATE POLICY tenant_isolation ON audit_events TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = audit_events.organisation_id AND o.account_id = current_setting('app.account_id', true))));

DROP POLICY tenant_isolation ON "account_subscriptions";
CREATE POLICY tenant_isolation ON account_subscriptions TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true));

DROP POLICY tenant_isolation ON "usage_counters";
CREATE POLICY tenant_isolation ON usage_counters TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true));

DROP POLICY tenant_isolation ON "account_settings";
CREATE POLICY tenant_isolation ON account_settings TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true));

COMMIT;
