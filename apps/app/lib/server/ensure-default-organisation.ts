import { withTenantDb } from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import "server-only";

import { clerkClient } from "@repo/auth/server";
import { ensureOrganisationForClerk } from "@repo/availability";
import type { ClerkOrgId, OrganisationId } from "@repo/core";

interface DefaultOrganisationContext {
  clerkOrgId: ClerkOrgId;
  organisationId: OrganisationId;
}

export async function ensureDefaultOrganisation(
  clerkOrgId: ClerkOrgId
): Promise<DefaultOrganisationContext> {
  assertNoTenantTransaction("ensureDefaultOrganisation");
  const name = await loadClerkOrganisationName(clerkOrgId);

  return withTenantDb(clerkOrgId, (db) =>
    ensureOrganisationForClerk(
      {
        clerkOrgId,
        countryCode: "AU",
        name,
      },
      db
    )
  );
}

async function loadClerkOrganisationName(
  clerkOrgId: ClerkOrgId
): Promise<string> {
  try {
    const clerk = await clerkClient();
    const organisation = await clerk.organizations.getOrganization({
      organizationId: clerkOrgId,
    });
    const name = organisation.name.trim();
    return name || "Organisation";
  } catch {
    return "Organisation";
  }
}
