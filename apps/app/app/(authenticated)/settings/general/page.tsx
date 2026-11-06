import { getAccount } from "@repo/auth/accounts";
import { getSession } from "@repo/auth/server";
import { type AccountId, isCountryCode, REGIONS } from "@repo/core";
import { withTenantDb } from "@repo/database";
import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
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
  await requirePagePermission({ settings: ["update"] });

  const { org: orgParam } = await searchParams;
  const { accountId: sessionAccountId } = (await getSession()) ?? {
    accountId: null,
    role: null,
    sessionId: null,
    userId: null,
  };
  if (!sessionAccountId) {
    throw new Error("No active account selected.");
  }

  const account = await getAccount(sessionAccountId);
  const accountId = sessionAccountId as AccountId;
  const { organisation, organisationId } = await withTenantDb(
    accountId,
    async (db) => {
      const { organisationId: scopedOrganisationId } =
        await resolveActiveOrgPageContext(accountId, orgParam, db);
      const preparedOrganisation = await db.organisation.findFirst({
        select: {
          country_code: true,
          name: true,
          region_code: true,
          timezone: true,
        },
        where: { account_id: accountId, id: scopedOrganisationId },
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
        slug: account.slug,
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
