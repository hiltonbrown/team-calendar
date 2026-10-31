-- Profile, Account and invitation audit belongs to the same database commit as
-- the native mutation. Internal membership-lock revision writes are excluded.
CREATE FUNCTION public.auth_audit_lifecycle_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE action text; subject_account uuid; subject_user uuid; previous_value jsonb; next_value jsonb;
BEGIN
  IF TG_TABLE_NAME = 'auth_users' THEN
    IF (NEW.name, NEW.email, NEW.email_verified, NEW.image) IS NOT DISTINCT FROM
       (OLD.name, OLD.email, OLD.email_verified, OLD.image) THEN RETURN NULL; END IF;
    action := 'user.updated'; subject_user := NEW.id;
    previous_value := jsonb_build_object('name', OLD.name, 'emailVerified', OLD.email_verified);
    next_value := jsonb_build_object('name', NEW.name, 'emailVerified', NEW.email_verified);
  ELSIF TG_TABLE_NAME = 'accounts' THEN
    IF (NEW.name, NEW.logo, NEW.provisioning_status) IS NOT DISTINCT FROM
       (OLD.name, OLD.logo, OLD.provisioning_status) THEN RETURN NULL; END IF;
    action := CASE WHEN NEW.provisioning_status <> OLD.provisioning_status THEN 'account.provisioned' ELSE 'account.updated' END;
    subject_account := NEW.id;
    previous_value := jsonb_build_object('name', OLD.name, 'provisioningStatus', OLD.provisioning_status);
    next_value := jsonb_build_object('name', NEW.name, 'provisioningStatus', NEW.provisioning_status);
  ELSE
    subject_account := NEW.account_id;
    IF TG_OP = 'INSERT' THEN action := 'invitation.created';
    ELSE
      IF (NEW.status, NEW.role) IS NOT DISTINCT FROM (OLD.status, OLD.role) THEN RETURN NULL; END IF;
      action := 'invitation.updated';
      previous_value := jsonb_build_object('role', OLD.role, 'status', OLD.status);
    END IF;
    next_value := jsonb_build_object('invitationId', NEW.id, 'role', NEW.role, 'status', NEW.status);
  END IF;
  INSERT INTO public.auth_audit_events(account_id, actor_user_id, target_user_id, event_type, before_value, after_value)
  VALUES(subject_account, nullif(current_setting('app.auth_actor_user_id', true), '')::uuid, subject_user, action, previous_value, next_value);
  RETURN NULL;
END $$;
CREATE TRIGGER auth_user_profile_audit AFTER UPDATE ON public.auth_users
FOR EACH ROW EXECUTE FUNCTION public.auth_audit_lifecycle_change();
CREATE TRIGGER auth_account_update_audit AFTER UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.auth_audit_lifecycle_change();
CREATE TRIGGER auth_invitation_audit AFTER INSERT OR UPDATE ON public.account_invitations
FOR EACH ROW EXECUTE FUNCTION public.auth_audit_lifecycle_change();
REVOKE ALL ON FUNCTION public.auth_audit_lifecycle_change() FROM PUBLIC;
