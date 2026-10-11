import "server-only";

import { requireOrg } from "@repo/auth/helpers";
import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { resolveAccountCompanies } from "@repo/database/queries/account-companies";
import { notFound } from "next/navigation";
import { getActiveOrgContext } from "./get-active-org-context";

export interface ActiveOrgPageContext {
  clerkOrgId: ClerkOrgId;
  organisationId: OrganisationId;
  orgQueryValue: string | null;
  orgSource: "clerk_cookie" | "query";
}

export async function requireActiveOrgPageContext(
  org?: string
): Promise<ActiveOrgPageContext> {
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

  let clerkOrgId: ClerkOrgId;
  try {
    clerkOrgId = (await requireOrg()) as ClerkOrgId;
  } catch {
    notFound();
  }

  let companies: Awaited<ReturnType<typeof resolveAccountCompanies>>;
  try {
    companies = await resolveAccountCompanies(clerkOrgId);
  } catch {
    notFound();
  }
  const organisationId = companies[0]?.id;

  if (!organisationId) {
    notFound();
  }

  return {
    clerkOrgId,
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
