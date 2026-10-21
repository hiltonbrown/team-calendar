import { withTenantDb } from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import "server-only";

import { requireOrg } from "@repo/auth/helpers";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { getOrganisationById } from "@repo/database/queries/organisations";

/**
 * Resolves the active organisation context from Clerk auth and validated params.
 * Must be called in server context only.
 *
 * Returns the clerk_org_id and organisation_id with full scope validation.
 * If organisation is missing or not accessible within the clerk_org_id boundary,
 * returns an error result.
 */
export async function getActiveOrgContext(organisationId: string): Promise<
  Result<{
    clerkOrgId: ClerkOrgId;
    organisationId: OrganisationId;
  }>
> {
  assertNoTenantTransaction("getActiveOrgContext");
  // Get authenticated Clerk Org ID
  let clerkOrgId: ClerkOrgId;
  try {
    clerkOrgId = (await requireOrg()) as ClerkOrgId;
  } catch {
    return {
      error: appError(
        "unauthorised",
        "Not authenticated or no organisation selected"
      ),
      ok: false,
    };
  }

  // Validate organisation exists and is within scope
  const orgResult = await withTenantDb(clerkOrgId, (db) =>
    getOrganisationById(clerkOrgId, organisationId as OrganisationId, db)
  );

  if (!orgResult.ok) {
    if (orgResult.error.code === "not_found") {
      return {
        error: appError(
          "not_found",
          "Organisation not found or not accessible in your context"
        ),
        ok: false,
      };
    }
    return {
      error: orgResult.error,
      ok: false,
    };
  }

  return {
    ok: true,
    value: {
      clerkOrgId,
      organisationId: organisationId as OrganisationId,
    },
  };
}
