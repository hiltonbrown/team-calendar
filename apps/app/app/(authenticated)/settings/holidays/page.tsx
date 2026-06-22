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

// S-23 Settings > Holidays is the admin-config counterpart to the S-11 member
// view at `/public-holidays`. It suppresses, restores, adds custom days, and
// refreshes holidays from the source API, so it is restricted to admins and
// owners. The read-only member surface lives at `/public-holidays`. This split
// is intentional per ScreenCatalogue v4.1; keep the two in sync.
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
