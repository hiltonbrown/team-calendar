import { withTenantDb } from "@repo/database";
import { z } from "zod";
import "server-only";

import { requireAccount } from "@repo/auth/helpers";
import type { AccountId, OrganisationId } from "@repo/core";
import { assertTenantDb, type TenantDb } from "@repo/database";
import { resolveAccountCompanies } from "@repo/database/queries/account-companies";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { notFound } from "next/navigation";
import { getActiveOrgContext } from "./get-active-org-context";

export interface ActiveOrgPageContext {
  accountId: AccountId;
  organisationId: OrganisationId;
  orgQueryValue: string | null;
  orgSource: "clerk_cookie" | "query";
}

export async function requireActiveOrgPageContext(
  org?: string
): Promise<ActiveOrgPageContext> {
  assertNoTenantTransaction("requireActiveOrgPageContext");
  const orgQueryValue = normaliseOrgQueryValue(org);

  if (orgQueryValue) {
    const contextResult = await getActiveOrgContext(orgQueryValue);

    if (!contextResult.ok) {
      notFound();
    }

    return {
      ...contextResult.value,
      orgQueryValue,
      orgSource: "query",
    };
  }

  let accountId: AccountId;
  try {
    accountId = (await requireAccount()) as AccountId;
  } catch {
    notFound();
  }

  let companies: Awaited<ReturnType<typeof resolveAccountCompanies>>;
  try {
    companies = await withTenantDb(accountId, (db) =>
      resolveAccountCompanies(accountId, db)
    );
  } catch {
    notFound();
  }
  const organisationId = companies[0]?.id;

  if (!organisationId) {
    notFound();
  }

  return {
    accountId,
    // The canonical resolver returns owned organisation UUIDs.
    organisationId: organisationId as OrganisationId,
    orgQueryValue: null,
    orgSource: "clerk_cookie",
  };
}

function normaliseOrgQueryValue(org?: string): string | null {
  const trimmed = org?.trim();
  return trimmed ? trimmed : null;
}

/** Resolve company ownership using the caller's authenticated account and request client. */
export async function resolveActiveOrgPageContext(
  accountId: AccountId,
  org: string | undefined,
  db: TenantDb
): Promise<ActiveOrgPageContext> {
  assertTenantDb(db, accountId);
  const orgQueryValue = normaliseOrgQueryValue(org);
  if (orgQueryValue) {
    if (!z.string().uuid().safeParse(orgQueryValue).success) {
      notFound();
    }
    // The query validates both ownership and the organisation identifier before returning context.
    const result = await getOrganisationById(
      accountId,
      orgQueryValue as OrganisationId,
      db
    );
    if (!result.ok) {
      notFound();
    }
    return {
      accountId,
      organisationId: result.value.id as OrganisationId,
      orgQueryValue,
      orgSource: "query",
    };
  }
  const [company] = await resolveAccountCompanies(accountId, db);
  if (!company) {
    notFound();
  }
  return {
    accountId,
    organisationId: company.id as OrganisationId,
    orgQueryValue: null,
    orgSource: "clerk_cookie",
  };
}
