-- Deferred constraints permit atomic user/Account/member bootstrap. Parent writes
-- serialize membership changes, including under repeatable-read isolation.
ALTER TABLE public.auth_users ADD COLUMN membership_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.accounts ADD COLUMN membership_revision INTEGER NOT NULL DEFAULT 0;

CREATE FUNCTION public.auth_lock_membership_parents() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.user_id <> OLD.user_id OR NEW.account_id <> OLD.account_id) THEN
    RAISE EXCEPTION 'Membership identity cannot change' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    UPDATE public.accounts SET membership_revision = membership_revision + 1 WHERE id = OLD.account_id;
    UPDATE public.auth_users SET membership_revision = membership_revision + 1 WHERE id = OLD.user_id;
    RETURN OLD;
  END IF;
  UPDATE public.accounts SET membership_revision = membership_revision + 1 WHERE id = NEW.account_id;
  UPDATE public.auth_users SET membership_revision = membership_revision + 1 WHERE id = NEW.user_id;
  RETURN NEW;
END $$;
CREATE TRIGGER auth_membership_parent_locks BEFORE INSERT OR UPDATE OR DELETE ON public.account_members
FOR EACH ROW EXECUTE FUNCTION public.auth_lock_membership_parents();

CREATE FUNCTION public.auth_check_membership_invariants() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE subject_user uuid; subject_account uuid;
BEGIN
  IF TG_TABLE_NAME = 'auth_users' THEN subject_user := NEW.id;
  ELSIF TG_TABLE_NAME = 'accounts' THEN subject_account := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN subject_user := OLD.user_id; subject_account := OLD.account_id;
  ELSE subject_user := NEW.user_id; subject_account := NEW.account_id;
  END IF;
  IF subject_user IS NOT NULL AND EXISTS (SELECT 1 FROM public.auth_users WHERE id = subject_user)
    AND NOT EXISTS (SELECT 1 FROM public.account_members WHERE user_id = subject_user) THEN
    RAISE EXCEPTION 'Every user must belong to an Account' USING ERRCODE = '23514';
  END IF;
  IF subject_account IS NOT NULL AND EXISTS (SELECT 1 FROM public.accounts WHERE id = subject_account)
    AND NOT EXISTS (SELECT 1 FROM public.account_members WHERE account_id = subject_account AND role = 'owner') THEN
    RAISE EXCEPTION 'Every Account must retain an owner' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER auth_user_requires_membership AFTER INSERT ON public.auth_users
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.auth_check_membership_invariants();
CREATE CONSTRAINT TRIGGER auth_account_requires_owner AFTER INSERT ON public.accounts
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.auth_check_membership_invariants();
CREATE CONSTRAINT TRIGGER auth_member_retains_membership AFTER INSERT OR UPDATE OR DELETE ON public.account_members
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.auth_check_membership_invariants();

CREATE FUNCTION public.auth_audit_membership_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE previous_value jsonb; next_value jsonb; subject_user uuid; subject_account uuid; action text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    previous_value := jsonb_build_object('role', OLD.role);
    subject_user := OLD.user_id; subject_account := OLD.account_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    next_value := jsonb_build_object('role', NEW.role);
    subject_user := NEW.user_id; subject_account := NEW.account_id;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.role = OLD.role THEN RETURN NULL; END IF;
  action := CASE TG_OP WHEN 'INSERT' THEN 'membership.created' WHEN 'UPDATE' THEN 'membership.role_changed' ELSE 'membership.removed' END;
  INSERT INTO public.auth_audit_events(account_id, actor_user_id, target_user_id, event_type, before_value, after_value)
  VALUES (subject_account, nullif(current_setting('app.auth_actor_user_id', true), '')::uuid, subject_user, action, previous_value, next_value);
  IF TG_OP <> 'INSERT' THEN DELETE FROM public.auth_sessions WHERE user_id = subject_user; END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER auth_membership_audit AFTER INSERT OR UPDATE OR DELETE ON public.account_members
FOR EACH ROW EXECUTE FUNCTION public.auth_audit_membership_change();

CREATE FUNCTION public.auth_check_account_country() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE expected public.payroll_region;
BEGIN
  IF TG_TABLE_NAME = 'accounts' THEN
    IF NEW.country_code <> OLD.country_code THEN
      RAISE EXCEPTION 'An Account country cannot change' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.account_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT country_code INTO expected FROM public.accounts WHERE id = NEW.account_id::uuid FOR SHARE;
    IF expected IS NULL OR expected::text <> NEW.country_code THEN
      RAISE EXCEPTION 'Company country must match its Account' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER auth_account_country_immutable BEFORE UPDATE OF country_code ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.auth_check_account_country();
CREATE TRIGGER auth_company_account_country BEFORE INSERT OR UPDATE OF account_id, country_code ON public.organisations
FOR EACH ROW EXECUTE FUNCTION public.auth_check_account_country();

REVOKE ALL ON FUNCTION public.auth_lock_membership_parents() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_check_membership_invariants() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_audit_membership_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_check_account_country() FROM PUBLIC;

CREATE FUNCTION public.auth_audit_identity_creation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_TABLE_NAME = 'auth_users' THEN
    INSERT INTO public.auth_audit_events(target_user_id, event_type)
    VALUES (NEW.id, 'user.created');
  ELSE
    INSERT INTO public.auth_audit_events(account_id, event_type, after_value)
    VALUES (NEW.id, 'account.created', jsonb_build_object('name', NEW.name, 'countryCode', NEW.country_code));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER auth_user_creation_audit AFTER INSERT ON public.auth_users
FOR EACH ROW EXECUTE FUNCTION public.auth_audit_identity_creation();
CREATE TRIGGER auth_account_creation_audit AFTER INSERT ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.auth_audit_identity_creation();
REVOKE ALL ON FUNCTION public.auth_audit_identity_creation() FROM PUBLIC;
