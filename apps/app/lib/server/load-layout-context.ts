import "server-only";

import type { ClerkOrgId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { listOrganisationsByClerkOrg } from "@repo/database/src/queries/organisations";

/**
 * Loads organisations for the authenticated user's Clerk Org.
 * Used by the root layout to populate org context and navigation.
 */
export async function loadLayoutContext(clerkOrgId: ClerkOrgId): Promise<
  Result<{
    organisations: Array<{
      id: string;
      name: string;
      countryCode: string;
    }>;
  }>
> {
  try {
    const orgsResult = await listOrganisationsByClerkOrg(clerkOrgId);

    if (!orgsResult.ok) {
      return {
        ok: false,
        error: orgsResult.error,
      };
    }

    return {
      ok: true,
      value: {
        organisations: orgsResult.value.map((org) => ({
          id: org.id,
          name: org.name,
          countryCode: org.countryCode,
        })),
      },
    };
  } catch {
    return {
      ok: false,
      error: appError("internal", "Failed to load layout context"),
    };
  }
}
