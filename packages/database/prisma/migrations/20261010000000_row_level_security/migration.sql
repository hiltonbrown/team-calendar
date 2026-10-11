-- Passwords and LOGIN are provisioned out of band by the environment operator.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'team_calendar_app') THEN
    CREATE ROLE team_calendar_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
  END IF;
END $$;
ALTER ROLE team_calendar_app NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
GRANT USAGE ON SCHEMA public TO team_calendar_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM team_calendar_app;
GRANT SELECT ON plans, plan_limits TO team_calendar_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO team_calendar_app;

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organisations TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON organisations TO team_calendar_app;

ALTER TABLE organisation_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organisation_settings TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = organisation_settings.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON organisation_settings TO team_calendar_app;

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON teams TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = teams.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON teams TO team_calendar_app;

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON locations TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = locations.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON locations TO team_calendar_app;

ALTER TABLE people ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON people TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = people.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON people TO team_calendar_app;

ALTER TABLE alternative_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON alternative_contacts TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = alternative_contacts.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON alternative_contacts TO team_calendar_app;

ALTER TABLE xero_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON xero_connections TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = xero_connections.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON xero_connections TO team_calendar_app;

ALTER TABLE xero_oauth_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON xero_oauth_sessions TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = xero_oauth_sessions.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON xero_oauth_sessions TO team_calendar_app;

ALTER TABLE xero_sync_cursors ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON xero_sync_cursors TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = xero_sync_cursors.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON xero_sync_cursors TO team_calendar_app;

ALTER TABLE availability_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON availability_records TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = availability_records.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON availability_records TO team_calendar_app;

ALTER TABLE outbound_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON outbound_operations TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = outbound_operations.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON outbound_operations TO team_calendar_app;

ALTER TABLE availability_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON availability_publications TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = availability_publications.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON availability_publications TO team_calendar_app;

ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON leave_balances TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = leave_balances.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON leave_balances TO team_calendar_app;

ALTER TABLE xero_person_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON xero_person_matches TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = xero_person_matches.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON xero_person_matches TO team_calendar_app;

ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public_holidays TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = public_holidays.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON public_holidays TO team_calendar_app;

ALTER TABLE public_holiday_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public_holiday_preferences TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = public_holiday_preferences.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON public_holiday_preferences TO team_calendar_app;

ALTER TABLE feeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON feeds TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = feeds.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON feeds TO team_calendar_app;

ALTER TABLE feed_event_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON feed_event_publications TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = feed_event_publications.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON feed_event_publications TO team_calendar_app;

ALTER TABLE feed_scopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON feed_scopes TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = feed_scopes.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON feed_scopes TO team_calendar_app;

ALTER TABLE feed_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON feed_tokens TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = feed_tokens.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON feed_tokens TO team_calendar_app;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = notifications.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO team_calendar_app;

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_preferences TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = notification_preferences.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_preferences TO team_calendar_app;

ALTER TABLE notification_email_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_email_queue TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = notification_email_queue.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_email_queue TO team_calendar_app;

ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sync_runs TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = sync_runs.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON sync_runs TO team_calendar_app;

ALTER TABLE failed_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON failed_records TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = failed_records.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON failed_records TO team_calendar_app;

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_events TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = audit_events.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_events TO team_calendar_app;

ALTER TABLE clerk_org_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clerk_org_subscriptions TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON clerk_org_subscriptions TO team_calendar_app;

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON usage_counters TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON usage_counters TO team_calendar_app;
