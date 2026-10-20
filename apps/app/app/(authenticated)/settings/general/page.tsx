import { auth, clerkClient } from "@repo/auth/server";
import { type ClerkOrgId, isCountryCode, REGIONS } from "@repo/core";
import { withTenantDb } from "@repo/database";
import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
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
  const { orgId } = await auth();
  if (!orgId) {
    throw new Error("No active account selected.");
  }
  const clerk = await clerkClient();
  const account = await clerk.organizations.getOrganization({
    organizationId: orgId,
  });
  const clerkOrgId = orgId as ClerkOrgId;
  const { organisation, organisationId } = await withTenantDb(
    clerkOrgId,
    async (db) => {
      const { organisationId: scopedOrganisationId } =
        await resolveActiveOrgPageContext(clerkOrgId, orgParam, db);
      const preparedOrganisation = await db.organisation.findFirst({
        select: {
          country_code: true,
          name: true,
          region_code: true,
          timezone: true,
        },
        where: { clerk_org_id: clerkOrgId, id: scopedOrganisationId },
      });
      if (!preparedOrganisation) {
        throw new Error("Organisation not found.");
      }
      return {
        organisation: preparedOrganisation,
        organisationId: scopedOrganisationId,
      };
    }
  );

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
      regionOptions={
        isCountryCode(organisation.country_code)
          ? REGIONS[organisation.country_code].map((region) => ({
              label: region.label,
              value: region.code,
            }))
          : []
      }
    />
  );
};

export default GeneralPage;
