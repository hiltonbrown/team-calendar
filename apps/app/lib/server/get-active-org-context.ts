import { withTenantDb } from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import "server-only";

import { requireAccount } from "@repo/auth/helpers";
import type { AccountId, OrganisationId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { getOrganisationById } from "@repo/database/queries/organisations";

/**
 * Resolves the active organisation context from Clerk getSession and validated params.
 * Must be called in server context only.
 *
 * Returns the account_id and organisation_id with full scope validation.
 * If organisation is missing or not accessible within the account_id boundary,
 * returns an error result.
 */
export async function getActiveOrgContext(organisationId: string): Promise<
  Result<{
    accountId: AccountId;
    organisationId: OrganisationId;
  }>
> {
  assertNoTenantTransaction("getActiveOrgContext");
  // Get authenticated Account ID
  let accountId: AccountId;
  try {
    accountId = (await requireAccount()) as AccountId;
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
  const orgResult = await withTenantDb(accountId, (db) =>
    getOrganisationById(accountId, organisationId as OrganisationId, db)
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
      accountId,
      organisationId: organisationId as OrganisationId,
    },
  };
}
