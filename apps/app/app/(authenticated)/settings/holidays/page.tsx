import { listForOrganisation } from "@repo/availability";
import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { HolidaysClient } from "./holidays-client";

export const metadata: Metadata = {
  description: "Manage public holiday imports and custom holidays.",
  title: "Holidays - Settings - Team Calendar",
};

interface HolidaysPageProps {
  searchParams: Promise<{ org?: string }>;
}

// Settings > Holidays is a summary and launch surface for admins and owners.
// `/public-holidays` is the single operational list for review and mutations.
const HolidaysPage = async ({ searchParams }: HolidaysPageProps) => {
  await requirePageRole("org:admin");
  const { org } = await searchParams;
  const { clerkOrgId, organisationId } = await requireActiveOrgPageContext(org);
  const holidaysResult = await listForOrganisation(clerkOrgId, organisationId);

  if (!holidaysResult.ok) {
    throw new Error(holidaysResult.error.message);
  }

  return (
    <HolidaysClient
      holidays={holidaysResult.value}
      organisationId={organisationId}
    />
  );
};

export default HolidaysPage;
