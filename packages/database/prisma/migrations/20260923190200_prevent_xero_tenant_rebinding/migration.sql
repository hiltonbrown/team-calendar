-- Reviewed by hand: Prisma cannot express an OLD-versus-NEW constraint.
CREATE FUNCTION "prevent_xero_tenant_rebinding"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."xero_tenant_id" IS DISTINCT FROM OLD."xero_tenant_id" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'xero_tenants_xero_tenant_id_immutable',
      MESSAGE = 'Xero tenant binding is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "xero_tenants_xero_tenant_id_immutable"
BEFORE UPDATE OF "xero_tenant_id" ON "xero_tenants"
FOR EACH ROW
EXECUTE FUNCTION "prevent_xero_tenant_rebinding"();
