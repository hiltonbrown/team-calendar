import { requireAccount } from "@repo/auth/helpers";
import type { AccountId } from "@repo/core";
import {
  resolveAccountCompanies,
  TENANT_READ_TRANSACTION_OPTIONS,
  withTenantDb,
} from "@repo/database";
import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { Header } from "../../components/header";
import { NewPersonClient } from "./new-person-client";

export const metadata: Metadata = {
  title: "Add Person | Team Calendar",
};

interface NewPersonPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewPersonPage({
  searchParams,
}: NewPersonPageProps) {
  await requirePagePermission({ people: ["manage"] });

  const params = await searchParams;
  const orgParam = typeof params.org === "string" ? params.org : undefined;
  // Authentication completes before owned company preparation.
  const accountId = (await requireAccount()) as AccountId;
  const { organisationId, orgQueryValue, companies } = await withTenantDb(
    accountId,
    async (db) => {
      const context = await resolveActiveOrgPageContext(
        accountId,
        orgParam,
        db
      );
      const preparedCompanies = await resolveAccountCompanies(accountId, db);
      return { ...context, companies: preparedCompanies };
    },
    TENANT_READ_TRANSACTION_OPTIONS
  );

  return (
    <>
      <Header page="People" />
      <NewPersonClient
        companies={companies}
        organisationId={organisationId}
        orgQueryValue={orgQueryValue}
      />
    </>
  );
}
