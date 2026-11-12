-- Fail-closed default privileges for future objects created in public.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, team_calendar_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, team_calendar_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, team_calendar_app;

-- Self-reference helper for feed_tokens.rotated_from_token_id so policy evaluation
-- does not recurse into feed_tokens under RLS.
CREATE OR REPLACE FUNCTION public.tc_feed_token_belongs_to_feed(
  candidate_token_id uuid,
  expected_feed_id uuid,
  expected_account_id text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT expected_account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.feed_tokens t
      WHERE t.id = candidate_token_id
        AND t.feed_id = expected_feed_id
        AND t.account_id = expected_account_id
    );
$$;
REVOKE ALL ON FUNCTION public.tc_feed_token_belongs_to_feed(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tc_feed_token_belongs_to_feed(uuid, uuid, text) TO team_calendar_app;

-- 1. Non-nullable company-scoped tables without single-column child FKs:
-- tighten WITH CHECK by removing the redundant `organisation_id IS NULL` branch.

DROP POLICY tenant_isolation ON "organisation_settings";
CREATE POLICY tenant_isolation ON organisation_settings TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = organisation_settings.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
  );

DROP POLICY tenant_isolation ON "teams";
CREATE POLICY tenant_isolation ON teams TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = teams.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
  );

DROP POLICY tenant_isolation ON "locations";
CREATE POLICY tenant_isolation ON locations TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = locations.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
  );

DROP POLICY tenant_isolation ON "xero_connections";
CREATE POLICY tenant_isolation ON xero_connections TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = xero_connections.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
  );

DROP POLICY tenant_isolation ON "xero_sync_cursors";
CREATE POLICY tenant_isolation ON xero_sync_cursors TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = xero_sync_cursors.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
  );

DROP POLICY tenant_isolation ON "public_holidays";
CREATE POLICY tenant_isolation ON public_holidays TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = public_holidays.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
  );

DROP POLICY tenant_isolation ON "notification_preferences";
CREATE POLICY tenant_isolation ON notification_preferences TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = notification_preferences.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
  );

DROP POLICY tenant_isolation ON "sync_runs";
CREATE POLICY tenant_isolation ON sync_runs TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = sync_runs.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
  );

DROP POLICY tenant_isolation ON "audit_events";
CREATE POLICY tenant_isolation ON audit_events TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = audit_events.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
  );

-- 2. Child tables with single-column foreign keys: enforce parent ownership
-- in WITH CHECK so PostgreSQL's owner-level FK triggers cannot link across
-- Accounts or across Organisations within an Account.

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
      team_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.teams t
        WHERE t.id = people.team_id
          AND t.account_id = people.account_id
          AND t.organisation_id = people.organisation_id
      )
    )
    AND (
      location_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.locations l
        WHERE l.id = people.location_id
          AND l.account_id = people.account_id
          AND l.organisation_id = people.organisation_id
      )
    )
    AND (
      manager_person_id IS NULL
      OR public.tc_manager_belongs_to_account(manager_person_id, account_id)
    )
  );

DROP POLICY tenant_isolation ON "alternative_contacts";
CREATE POLICY tenant_isolation ON alternative_contacts TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = alternative_contacts.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
    AND EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = alternative_contacts.person_id
        AND p.account_id = alternative_contacts.account_id
        AND p.organisation_id = alternative_contacts.organisation_id
    )
  );

DROP POLICY tenant_isolation ON "availability_records";
CREATE POLICY tenant_isolation ON availability_records TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = availability_records.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
    AND EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = availability_records.person_id
        AND p.account_id = availability_records.account_id
        AND p.organisation_id = availability_records.organisation_id
    )
    AND (
      approved_by_person_id IS NULL
      OR public.tc_manager_belongs_to_account(approved_by_person_id, account_id)
    )
  );

DROP POLICY tenant_isolation ON "outbound_operations";
CREATE POLICY tenant_isolation ON outbound_operations TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = outbound_operations.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
    AND EXISTS (
      SELECT 1 FROM public.availability_records r
      WHERE r.id = outbound_operations.availability_record_id
        AND r.account_id = outbound_operations.account_id
        AND r.organisation_id = outbound_operations.organisation_id
    )
  );

DROP POLICY tenant_isolation ON "availability_publications";
CREATE POLICY tenant_isolation ON availability_publications TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = availability_publications.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
    AND EXISTS (
      SELECT 1 FROM public.availability_records r
      WHERE r.id = availability_publications.availability_record_id
        AND r.account_id = availability_publications.account_id
        AND r.organisation_id = availability_publications.organisation_id
    )
  );

DROP POLICY tenant_isolation ON "leave_balances";
CREATE POLICY tenant_isolation ON leave_balances TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = leave_balances.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
    AND EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = leave_balances.person_id
        AND p.account_id = leave_balances.account_id
        AND p.organisation_id = leave_balances.organisation_id
    )
  );

DROP POLICY tenant_isolation ON "xero_person_matches";
CREATE POLICY tenant_isolation ON xero_person_matches TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = xero_person_matches.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
    AND EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = xero_person_matches.xero_person_id
        AND p.account_id = xero_person_matches.account_id
        AND p.organisation_id = xero_person_matches.organisation_id
    )
    AND (
      candidate_person_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.people p
        WHERE p.id = xero_person_matches.candidate_person_id
          AND p.account_id = xero_person_matches.account_id
          AND p.organisation_id = xero_person_matches.organisation_id
      )
    )
    AND (
      resolved_person_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.people p
        WHERE p.id = xero_person_matches.resolved_person_id
          AND p.account_id = xero_person_matches.account_id
          AND p.organisation_id = xero_person_matches.organisation_id
      )
    )
  );

DROP POLICY tenant_isolation ON "public_holiday_preferences";
CREATE POLICY tenant_isolation ON public_holiday_preferences TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = public_holiday_preferences.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
    AND (
      location_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.locations l
        WHERE l.id = public_holiday_preferences.location_id
          AND l.account_id = public_holiday_preferences.account_id
          AND l.organisation_id = public_holiday_preferences.organisation_id
      )
    )
  );

DROP POLICY tenant_isolation ON "feed_event_publications";
CREATE POLICY tenant_isolation ON feed_event_publications TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND (
      organisation_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.organisations o
        WHERE o.id = feed_event_publications.organisation_id
          AND o.account_id = current_setting('app.account_id', true)
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.feeds f
      WHERE f.id = feed_event_publications.feed_id
        AND f.account_id = feed_event_publications.account_id
        AND f.organisation_id IS NOT DISTINCT FROM feed_event_publications.organisation_id
    )
  );

DROP POLICY tenant_isolation ON "feed_scopes";
CREATE POLICY tenant_isolation ON feed_scopes TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND (
      organisation_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.organisations o
        WHERE o.id = feed_scopes.organisation_id
          AND o.account_id = current_setting('app.account_id', true)
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.feeds f
      WHERE f.id = feed_scopes.feed_id
        AND f.account_id = feed_scopes.account_id
        AND f.organisation_id IS NOT DISTINCT FROM feed_scopes.organisation_id
    )
  );

DROP POLICY tenant_isolation ON "feed_tokens";
CREATE POLICY tenant_isolation ON feed_tokens TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND (
      organisation_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.organisations o
        WHERE o.id = feed_tokens.organisation_id
          AND o.account_id = current_setting('app.account_id', true)
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.feeds f
      WHERE f.id = feed_tokens.feed_id
        AND f.account_id = feed_tokens.account_id
        AND f.organisation_id IS NOT DISTINCT FROM feed_tokens.organisation_id
    )
    AND (
      rotated_from_token_id IS NULL
      OR public.tc_feed_token_belongs_to_feed(rotated_from_token_id, feed_id, account_id)
    )
  );

DROP POLICY tenant_isolation ON "notifications";
CREATE POLICY tenant_isolation ON notifications TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = notifications.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
    AND (
      recipient_person_id IS NULL
      OR public.tc_manager_belongs_to_account(recipient_person_id, account_id)
    )
  );

DROP POLICY tenant_isolation ON "notification_email_queue";
CREATE POLICY tenant_isolation ON notification_email_queue TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = notification_email_queue.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
    AND (
      notification_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.id = notification_email_queue.notification_id
          AND n.account_id = notification_email_queue.account_id
          AND n.organisation_id = notification_email_queue.organisation_id
      )
    )
  );

DROP POLICY tenant_isolation ON "failed_records";
CREATE POLICY tenant_isolation ON failed_records TO team_calendar_app
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (
    account_id = current_setting('app.account_id', true)
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = failed_records.organisation_id
        AND o.account_id = current_setting('app.account_id', true)
    )
    AND EXISTS (
      SELECT 1 FROM public.sync_runs s
      WHERE s.id = failed_records.sync_run_id
        AND s.account_id = failed_records.account_id
        AND s.organisation_id = failed_records.organisation_id
    )
  );
