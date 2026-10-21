import { requireOrg } from "@repo/auth/helpers";
import type { ClerkOrgId } from "@repo/core";
import {
  resolveAccountCompanies,
  TENANT_READ_TRANSACTION_OPTIONS,
  withTenantDb,
} from "@repo/database";
import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
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
  await requirePageRole("org:admin");

  const params = await searchParams;
  const orgParam = typeof params.org === "string" ? params.org : undefined;
  // Clerk authentication completes before owned company preparation.
  const clerkOrgId = (await requireOrg()) as ClerkOrgId;
  const { organisationId, orgQueryValue, companies } = await withTenantDb(
    clerkOrgId,
    async (db) => {
      const context = await resolveActiveOrgPageContext(
        clerkOrgId,
        orgParam,
        db
      );
      const preparedCompanies = await resolveAccountCompanies(clerkOrgId, db);
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
