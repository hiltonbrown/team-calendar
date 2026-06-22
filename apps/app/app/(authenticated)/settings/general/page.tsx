import { auth, clerkClient } from "@repo/auth/server";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { GeneralClient } from "./general-client";

export const metadata: Metadata = {
  description: "Manage your account and payroll entity settings.",
  title: "General - Settings - Team Calendar",
};

interface GeneralPageProps {
  searchParams: Promise<{
    org?: string;
  }>;
}

const GeneralPage = async ({ searchParams }: GeneralPageProps) => {
  await requirePageRole("org:admin");

  const { org: orgParam } = await searchParams;
  const [{ orgId }, { clerkOrgId, organisationId }] = await Promise.all([
    auth(),
    requireActiveOrgPageContext(orgParam),
  ]);

  if (!orgId) {
    throw new Error("No active account selected.");
  }

  const [clerk, organisation] = await Promise.all([
    clerkClient(),
    database.organisation.findFirst({
      where: {
        clerk_org_id: clerkOrgId,
        id: organisationId,
      },
      select: {
        country_code: true,
        name: true,
        region_code: true,
        timezone: true,
      },
    }),
  ]);

  if (!organisation) {
    throw new Error("Organisation not found.");
  }

  const account = await clerk.organizations.getOrganization({
    organizationId: orgId,
  });

  return (
    <GeneralClient
      account={{
        name: account.name,
        slug: account.slug ?? null,
      }}
      organisation={{
        countryCode: organisation.country_code as "AU" | "NZ" | "UK",
        id: organisationId,
        name: organisation.name,
        regionCode: organisation.region_code,
        timezone: organisation.timezone ?? "Australia/Brisbane",
      }}
    />
  );
};

export default GeneralPage;
