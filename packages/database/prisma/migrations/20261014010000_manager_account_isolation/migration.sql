-- Avoid recursive people RLS lookups while checking a manager reference.
-- The only returned value is whether the referenced person belongs to the
-- caller's current account; arbitrary account probing always returns false.
CREATE FUNCTION public.tc_manager_belongs_to_account(manager_id uuid, account_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT account_id = current_setting('app.clerk_org_id', true)
    AND EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = manager_id AND p.clerk_org_id = account_id
        AND EXISTS (SELECT 1 FROM public.organisations o WHERE o.id = p.organisation_id AND o.clerk_org_id = account_id)
    );
$$;
REVOKE ALL ON FUNCTION public.tc_manager_belongs_to_account(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tc_manager_belongs_to_account(uuid, text) TO team_calendar_app;

ALTER POLICY tenant_isolation ON public.people
WITH CHECK (
  clerk_org_id = current_setting('app.clerk_org_id', true)
  AND EXISTS (
    SELECT 1 FROM public.organisations o
    WHERE o.id = people.organisation_id
      AND o.clerk_org_id = current_setting('app.clerk_org_id', true)
  )
  AND (
    manager_person_id IS NULL
    OR public.tc_manager_belongs_to_account(manager_person_id, clerk_org_id)
  )
);
