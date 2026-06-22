import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
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
  const { organisationId, orgQueryValue } =
    await requireActiveOrgPageContext(orgParam);

  return (
    <>
      <Header page="People" />
      <NewPersonClient
        organisationId={organisationId}
        orgQueryValue={orgQueryValue}
      />
    </>
  );
}
