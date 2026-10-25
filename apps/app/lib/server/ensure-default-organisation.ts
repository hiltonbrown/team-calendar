import { getAccount } from "@repo/auth/accounts";
import { withTenantDb } from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import "server-only";

import { ensureOrganisationForAccount } from "@repo/availability";
import type { AccountId, OrganisationId } from "@repo/core";

interface DefaultOrganisationContext {
  accountId: AccountId;
  organisationId: OrganisationId;
}

export async function ensureDefaultOrganisation(
  accountId: AccountId
): Promise<DefaultOrganisationContext> {
  assertNoTenantTransaction("ensureDefaultOrganisation");
  const name = await loadAccountName(accountId);

  return withTenantDb(accountId, (db) =>
    ensureOrganisationForAccount(
      {
        accountId,
        countryCode: "AU",
        name,
      },
      db
    )
  );
}

async function loadAccountName(accountId: AccountId): Promise<string> {
  try {
    const organisation = await getAccount(accountId);
    const name = organisation.name.trim();
    return name || "Organisation";
  } catch {
    return "Organisation";
  }
}
